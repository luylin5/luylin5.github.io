"""Turn deposited CIFs into web-ready unit-cell files for the per-paper CIF viewer.

Usage:  python tools-dev/build_cifs.py

Input   structures/cif-src/*.cif   (git-ignored; e.g. CIFs downloaded from the CCDC —
                                    files may hold several data blocks)
Output  structures/cif/<ccdc>.json  unit cell: whole molecules, bonds, cell vectors
        structures/cif/<ccdc>.cif   the data block without embedded hkl/res/fab data
        structures/cif/manifest.json  { doi: [ {ccdc, label, ...} ] } read by js/cif-viewer.js

A block is matched to a paper by its _citation_doi (CCDC downloads carry it), else by its
CCDC number (_database_code_depnum_ccdc_archive) via PAPERS; blocks without either can be
mapped by file name in FILE_TO_CCDC below.
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
    "10.1021/jacs.4c06102": [2206002, 2206003, 2206005, 2206006, 2206007, 2206008, 2206009, 2348552,
                             2072298, 2460079],
    "10.1021/acscatal.3c04593": [2274984, 2274475, 2279965],
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
    2274984: "MOC-68·Cl (P6₂22)", 2274475: "MOC-68·Cl (P6₄22)", 2279965: "MOC-68·PF₆",
    2324469: "MOC-70-Zn", 2324470: "MOC-70-Zn ⊃ calix[4]arene", 2324471: "MOC-70-Zn ⊃ DB24C8",
    2372338: "Photoproduct C₂₁H₁₉ClO₃", 2372339: "Photoproduct C₂₅H₂₇NO₃",
    2390659: "MOC-68·PF₆ ⊃ phenanthrene", 2390660: "Δ-MOC-68·CB[10]", 2390661: "Λ-MOC-68·CB[10]",
    2072298: "Δ-Co₈Pd₆ (S-BINOL)", 2460079: "rac-Co₈Pd₆·BF₄",
}
SUB = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")


def label_for(n, block):
    if n in LABELS: return LABELS[n]
    # Angew BINOL series, e.g. M16Ru_Sbr_Delta_Ether → Δ₈-Ru₈Pd₆·S-BINOL (ether)
    m = re.match(r"M16([A-Z][a-z]?)[_-]([RS])br[_-](Delta|Lambda)[_-](\w+)", block.name)
    if m:
        metal, hand, sense, solv = m.groups()
        solv = {"CH3OH": "MeOH", "MeOH": "MeOH", "THF": "THF", "Ether": "ether"}.get(solv, solv)
        return f"{'Δ₈' if sense == 'Delta' else 'Λ₈'}-{metal}₈Pd₆·{hand}-BINOL ({solv})"
    return block.name.replace("_", " ").translate(SUB)
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


def doi_of(block, n):
    for d in block.find_values("_citation_doi"):
        d = gemmi.cif.as_string(d).strip().lower()
        if d in PAPERS: return d
    return CCDC_TO_DOI.get(n)


def ccdc_of(block, path):
    v = block.find_value("_database_code_depnum_ccdc_archive")
    m = re.search(r"\d{7}", v or "")
    if m: return int(m.group())
    return FILE_TO_CCDC.get(os.path.splitext(os.path.basename(path))[0])


def unit_cell(block):
    st = gemmi.make_small_structure_from_block(block)
    groups = [gemmi.cif.as_string(g) for g in block.find_values("_atom_site_disorder_group")]
    if len(groups) != len(st.sites): groups = ["."] * len(st.sites)
    # PART 0/1 kept, PART ≥2 dropped; negative PARTs (molecules disordered about a special
    # position) are kept and resolved to one orientation below
    keep = [(s, g.startswith("-")) for s, g in zip(st.sites, groups) if g in ("", ".", "?", "0", "1") or g.startswith("-")]
    el = np.array([s.element.name for s, _ in keep])
    neg0 = np.array([n for _, n in keep])
    frac0 = np.array([[s.fract.x, s.fract.y, s.fract.z] for s, _ in keep])
    orth = np.array(st.cell.orth.mat.tolist())

    # all symmetry images in the 3×3×3 block of cells around the origin cell
    # (identity image first, so the greedy clash removal below favours the deposited orientation)
    shifts = sorted(itertools.product((-1, 0, 1), repeat=3), key=lambda t: t != (0, 0, 0))
    fr, els, neg, copy = [], [], [], []
    for o, op in enumerate(st.spacegroup.operations()):
        f = np.array([op.apply_to_xyz(list(x)) for x in frac0]) % 1.0
        for s, t in enumerate(shifts):
            fr.append(f + t); els.append(el); neg.append(neg0); copy.append(np.full(len(el), o * 27 + s))
    fr, els, neg, copy = np.vstack(fr), np.concatenate(els), np.concatenate(neg), np.concatenate(copy)
    cart = fr @ orth.T
    dropped = np.zeros(len(cart), bool)
    tree = cKDTree(cart)
    # 1) the same atom generated twice (special positions): keep one
    for i, j in sorted(tree.query_pairs(0.3)):
        if not dropped[i]: dropped[j] = True
    # 2) negative PART: a symmetry copy overlapping an earlier copy is the other disorder
    #    orientation → drop that whole copy (its negative-PART atoms)
    pairs = np.array(sorted(tree.query_pairs(0.8)))
    if len(pairs):
        a, b = pairs[:, 0], pairs[:, 1]
        m = neg[a] & neg[b] & (copy[a] != copy[b]) & ~dropped[a] & ~dropped[b]
        m &= np.linalg.norm(cart[a] - cart[b], axis=1) >= 0.3
        clash = {}
        for x, y in zip(copy[a[m]], copy[b[m]]):
            lo, hi = min(x, y), max(x, y)
            clash.setdefault(hi, set()).add(lo)
        rejected = set()
        for c in sorted(clash):  # greedy in copy order: identity image first
            if any(o not in rejected for o in clash[c]): rejected.add(c)
        if rejected: dropped |= neg & np.isin(copy, list(rejected))
    idx = np.where(~dropped)[0]
    fr, cart, els = fr[idx], cart[idx], els[idx]

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
        if fr[m].min() < -0.95 or fr[m].max() > 1.95:  # reaches the edge of the 3×3×3 block
            sel |= m & np.all((fr >= 0) & (fr < 1), axis=1)
        else:
            # molecules on special positions at a cell face have centroids at exactly 0 or 1;
            # a small tolerance makes exactly one lattice copy count as "inside"
            cen = fr[m].mean(0)
            if np.all((cen >= -1e-4) & (cen < 1 - 1e-4)):
                sel |= m
    # safety net: no atom may appear twice modulo a lattice translation (fragments joined by
    # spurious contacts can otherwise be counted from two neighbouring cells)
    si = np.where(sel)[0]
    wrapped = (fr[si] % 1.0) @ orth.T
    for i, j in sorted(cKDTree(wrapped, boxsize=None).query_pairs(0.3)):
        if sel[si[i]]: sel[si[j]] = False
    new = -np.ones(n, int); new[sel] = np.arange(sel.sum())
    keep_b = sel[bonds[:, 0]] & sel[bonds[:, 1]]
    return st, els[sel], cart[sel], new[bonds[keep_b]], orth


HEADER = """#######################################################################
#
# This file contains crystal structure data downloaded from the
# Cambridge Structural Database (CSD) hosted by the Cambridge
# Crystallographic Data Centre (CCDC).
#
# Full information about CCDC data access policies and citation
# guidelines are available at http://www.ccdc.cam.ac.uk/access/V1
#
# Audit and citation data items may have been added by the CCDC.
# Please retain this information to preserve the provenance of
# this file and to allow appropriate attribution of the data.
#
# Shortened for this website: the embedded SHELX .res/.fab files and the
# Olex2 refinement description were removed; all crystallographic data are
# unchanged. The complete entry is available from the CCDC (see the
# deposition number below).
#
#######################################################################

"""


def clean_block_text(block):
    for tag in STRIP:
        it = block.find_pair_item(tag)
        if it is not None: it.erase()
    doc = gemmi.cif.Document(); doc.add_copied_block(block)
    return HEADER + doc.as_string()


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for path in sorted(glob.glob(os.path.join(SRC, "*.cif"))):
        for block in gemmi.cif.read(path):
            if not block.find_values("_atom_site_label"): continue
            n = ccdc_of(block, path)
            doi = doi_of(block, n)
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
                "ccdc": n, "label": label_for(n, block), "sg": st.spacegroup.hm,
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
