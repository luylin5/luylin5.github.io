"""Turn deposited CIFs into web-ready unit-cell files for the per-paper CIF viewer.

Usage:  python tools-dev/build_cifs.py

Input   structures/cif-src/*.cif   (git-ignored; e.g. CIFs downloaded from the CCDC —
                                    files may hold several data blocks)
Output  structures/cif/<ccdc>.json  unit cell: whole molecules, bonds, cell vectors
        structures/cif/<ccdc>.cif   the data block without embedded hkl/res/fab data
        structures/cif/manifest.json  { doi: [ {ccdc, label, ...} ] } read by js/cif-viewer.js

A block is matched to a paper through its CCDC number (_database_code_depnum_ccdc_archive);
blocks without one can be mapped by file name in FILE_TO_CCDC below.
Disorder: PART 0 and PART 1 are kept; other parts (incl. negative, special-position
parts) are dropped. Labels come from LABELS, else the data-block name.
"""
import glob, json, os, re, itertools
import numpy as np, gemmi
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

SRC, OUT = "structures/cif-src", "structures/cif"

PAPERS = {  # doi: CCDC numbers cited in the paper
    "10.1038/s41557-026-02248-w": range(2515978, 2515989),
    "10.1016/j.chempr.2023.03.019": [2193724, 2193725],
    "10.1021/jacs.5c03074": [2372338, 2372339, 2390659, 2390660, 2390661],
    "10.1021/jacs.4c05758": [2324469, 2324470, 2324471],
    "10.1021/jacs.2c02692": [2142981],
    "10.1021/jacs.4c06102": [2206002, 2206003, 2206005, 2206006, 2206007, 2206008, 2206009, 2348552],
    "10.1002/anie.202315053": [2246600, 2233283, 2233397, 2233394, 2246587, 2246586, 2233278, 2233282, 2233396,
                               2233281, 2233395, 2246585, 2246588, 2246589, 2246594, 2246593, 2246590, 2292830,
                               2292826, 2292827, 2233384, 2246598, 2292829, 2292828, 2246592, 2246601, 2246591,
                               2246596, 2246599, 2246604, 2246595, 2246603, 2246597, 2246602],
}
CCDC_TO_DOI = {n: d for d, ns in PAPERS.items() for n in ns}

LABELS = {  # names as given in the papers
    2515978: "TAHP·Cl-α", 2515979: "TAHP·Cl-β", 2515980: "TAHPMe·Cl-nc", 2515981: "TAHPMe·N₄Cl₄",
    2515982: "TAHPMe·N₁₂Cl₇-A", 2515983: "TAHPMe·N₁₂Cl₇-C", 2515984: "Cyclohexane@TAHPMe·N₁₂Cl₁₂",
    2515985: "n-Heptane@TAHPMe·N₁₂Cl₁₂", 2515986: "TPA", 2515987: "TPA·N₆Cl₇", 2515988: "TPA·N₁₂Cl₉",
    2193725: "MOC-68", 2193724: "(CB[10])₄@MOC-68",
    2246600: "rac-Δ₈/Λ₈-Zn₈Pd₆", 2233283: "meso-Δ₄Λ₄-Zn₈Pd₆·PF₆", 2233397: "rac-Δ₈/Λ₈-Zn₈Pd₆·SbF₆",
    2233394: "meso-Δ₄Λ₄-Zn₈Pd₆·SbF₆", 2246587: "rac-Δ₈/Λ₈-Zn₈Pd₆·ClO₄", 2246586: "meso-Δ₄Λ₄-Zn₈Pd₆·ClO₄",
    2233278: "rac-Δ₈/Λ₈-Ru₈Pd₆·PF₆", 2233282: "rac-Δ₈/Λ₈-Ru₈Pd₆·PF₆ (2)", 2233396: "rac-Δ₈/Λ₈-Ru₈Pd₆·SbF₆",
    2233281: "rac-Δ₈/Λ₈-Fe₈Pd₆·PF₆", 2233395: "rac-Δ₈/Λ₈-Fe₈Pd₆·SbF₆", 2246585: "rac-Δ₈/Λ₈-Fe₈Pd₆·ClO₄",
    2246588: "rac-Δ₈/Λ₈-Ni₈Pd₆·PF₆", 2246589: "rac-Δ₈/Λ₈-Ni₈Pd₆·SbF₆", 2246594: "Δ₈-Ru₈Pd₆",
    2246593: "Λ₈-Ru₈Pd₆", 2246590: "Δ₈-Fe₈Pd₆", 2292830: "Λ₈-Fe₈Pd₆",
    2246599: "rac-Ru₈Pd₆ (with R-BINOL)", 2246604: "rac-Ru₈Pd₆ (with S-BINOL)",
}
FILE_TO_CCDC = {"TAHPMe_N12Cl12_heptane": 2515985}  # local files lacking a CCDC number

# covalent radii (Å) for bond detection; anything else falls back to 1.5
COV = {"H": .31, "B": .84, "C": .76, "N": .71, "O": .66, "F": .57, "Si": 1.11, "P": 1.07, "S": 1.05,
       "Cl": 1.02, "Br": 1.20, "I": 1.39, "Fe": 1.32, "Co": 1.26, "Ni": 1.24, "Cu": 1.32, "Zn": 1.22,
       "Ru": 1.46, "Rh": 1.42, "Pd": 1.39, "Ag": 1.45, "Cd": 1.44, "Os": 1.44, "Ir": 1.41, "Pt": 1.36,
       "Au": 1.36, "Sb": 1.39, "Re": 1.51, "Zr": 1.75, "Na": 1.66, "K": 2.03}
IONIC = {"Cl", "Br", "I"}  # free halides: no covalent bonds to H-bond donors
STRIP = ("_shelx_hkl_file", "_shelx_res_file", "_shelx_fab_file", "_shelx_hkl_checksum",
         "_shelx_res_checksum", "_shelx_fab_checksum", "_iucr_refine_instructions_details",
         "_iucr_refine_reflections_details", "_olex2_refinement_description")


def ccdc_of(block, path):
    v = block.find_value("_database_code_depnum_ccdc_archive")
    m = re.search(r"\d{7}", v or "")
    if m: return int(m.group())
    return FILE_TO_CCDC.get(os.path.splitext(os.path.basename(path))[0])


def unit_cell(block):
    st = gemmi.make_small_structure_from_block(block)
    groups = list(block.find_values("_atom_site_disorder_group")) or ["."] * len(st.sites)
    keep = [s for s, g in zip(st.sites, groups) if g in (".", "?", "0", "1")]
    el = np.array([s.element.name for s in keep])
    frac0 = np.array([[s.fract.x, s.fract.y, s.fract.z] for s in keep])
    orth = np.array(st.cell.orth.mat.tolist())

    # all symmetry images in the 3×3×3 block of cells around the origin cell
    fr, els = [], []
    for op in st.spacegroup.operations():
        f = np.array([op.apply_to_xyz(list(x)) for x in frac0]) % 1.0
        for t in itertools.product((-1, 0, 1), repeat=3):
            fr.append(f + t); els.append(el)
    fr, els = np.vstack(fr), np.concatenate(els)
    cart = fr @ orth.T
    _, idx = np.unique(np.round(cart, 1), axis=0, return_index=True)  # merge special-position copies
    idx.sort(); fr, cart, els = fr[idx], cart[idx], els[idx]

    rad = np.array([COV.get(e, 1.5) for e in els])
    pairs = np.array(sorted(cKDTree(cart).query_pairs(2 * rad.max() + 0.45)))
    a, b = pairs[:, 0], pairs[:, 1]
    d = np.linalg.norm(cart[a] - cart[b], axis=1)
    ok = (d < rad[a] + rad[b] + 0.45) & (d > 0.6)
    ok &= ~((els[a] == "H") & (els[b] == "H"))
    ok &= ~(np.isin(els[a], list(IONIC)) & (els[b] == "H")) & ~(np.isin(els[b], list(IONIC)) & (els[a] == "H"))
    bonds = pairs[ok]
    n = len(cart)
    ncomp, lab = connected_components(coo_matrix((np.ones(len(bonds)), (bonds[:, 0], bonds[:, 1])), shape=(n, n)), directed=False)

    # keep whole molecules whose centroid lies in the origin cell; extended networks
    # (components reaching the outer shell of the 3×3×3 block) are cut to the cell instead
    sel = np.zeros(n, bool)
    for k in range(ncomp):
        m = lab == k
        if np.any(np.abs(fr[m]) >= 1.4) or np.any(fr[m] >= 2.4):
            sel |= m & np.all((fr >= 0) & (fr < 1), axis=1)
        elif np.all((fr[m].mean(0) >= 0) & (fr[m].mean(0) < 1)):
            sel |= m
    new = -np.ones(n, int); new[sel] = np.arange(sel.sum())
    keep_b = sel[bonds[:, 0]] & sel[bonds[:, 1]]
    return st, els[sel], cart[sel], new[bonds[keep_b]], orth


def clean_block_text(block):
    for tag in STRIP:
        it = block.find_pair_item(tag)
        if it is not None: it.erase()
    doc = gemmi.cif.Document(); doc.add_copied_block(block)
    return doc.as_string()


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for path in sorted(glob.glob(os.path.join(SRC, "*.cif"))):
        for block in gemmi.cif.read(path):
            if not block.find_values("_atom_site_label"): continue
            n = ccdc_of(block, path)
            doi = CCDC_TO_DOI.get(n)
            if not doi:
                print(f"skip {os.path.basename(path)}:{block.name} (CCDC {n} not in PAPERS)"); continue
            st, els, cart, bonds, orth = unit_cell(block)
            c = st.cell
            json.dump({
                "el": els.tolist(), "xyz": np.round(cart, 3).ravel().tolist(), "bonds": bonds.ravel().tolist(),
                "cell": np.round(orth.T, 4).tolist(),  # rows = a, b, c lattice vectors (Å)
            }, open(f"{OUT}/{n}.json", "w"), separators=(",", ":"))
            open(f"{OUT}/{n}.cif", "w", encoding="utf-8").write(clean_block_text(block))
            entry = {
                "ccdc": n, "label": LABELS.get(n, block.name), "sg": st.spacegroup.hm,
                "cell": [round(c.a, 3), round(c.b, 3), round(c.c, 3), round(c.alpha, 2), round(c.beta, 2), round(c.gamma, 2)],
                "atoms": int(len(els)), "data": f"{OUT}/{n}.json", "cif": f"{OUT}/{n}.cif",
            }
            manifest.setdefault(doi, []).append(entry)
            print(f"{n} {entry['label']:<32} {entry['sg']:<10} {len(els):>6} atoms/cell  ← {os.path.basename(path)}")
    for v in manifest.values(): v.sort(key=lambda e: e["ccdc"])
    json.dump(manifest, open(f"{OUT}/manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    missing = sorted(set(CCDC_TO_DOI) - {e["ccdc"] for v in manifest.values() for e in v})
    print(f"\n{sum(map(len, manifest.values()))} structures; still missing {len(missing)}: {missing}")


if __name__ == "__main__":
    main()
