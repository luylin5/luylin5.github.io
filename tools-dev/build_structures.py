"""Build web-ready structure files for the 3D viewer from the source CIF.

Reads structures/TAHPMe_N12Cl12_heptane.cif (which also embeds hkl/res data that must
not be published) and writes small XYZ files plus a JSON with cell vectors:
  structures/web/tahpme-sbu.xyz   one N12Cl12 ionic cluster + the 12 cations bound to it
  structures/web/tahpme-cell.xyz  complete molecules whose centroid lies in one unit cell
The disordered heptane solvent (PART -1) is left out.
"""
import json, itertools
import numpy as np, gemmi
from scipy.spatial import cKDTree
from scipy.sparse.csgraph import connected_components
from scipy.sparse import coo_matrix

SRC = "structures/TAHPMe_N12Cl12_heptane.cif"
OUT = "structures/web/"
COV = {"H": 0.31, "C": 0.76, "N": 0.71, "Cl": 1.02}

block = gemmi.cif.read(SRC).sole_block()
st = gemmi.make_small_structure_from_block(block)
cell = st.cell
ops = st.spacegroup.operations()
sites = [s for s in st.sites if s.occ > 0.99]          # drop disordered heptane
el = [s.element.name for s in sites]
frac0 = np.array([[s.fract.x, s.fract.y, s.fract.z] for s in sites])

# all symmetry images in the 3x3x3 block of cells around the origin cell
pos, els = [], []
for op in ops:
    f = np.array([op.apply_to_xyz(list(x)) for x in frac0]) % 1.0
    for t in itertools.product((-1, 0, 1), repeat=3):
        pos.append(f + t); els += el
frac = np.vstack(pos); els = np.array(els)
# merge duplicates created by special positions
orth = np.array(cell.orth.mat.tolist())
cart = frac @ orth.T
_, keep = np.unique(np.round(cart, 2), axis=0, return_index=True)
keep.sort(); frac, cart, els = frac[keep], cart[keep], els[keep]

# covalent bonds → molecules
tree = cKDTree(cart)
pairs = np.array(list(tree.query_pairs(1.0 + 0.45 + 0.76)))
rad = np.array([COV[e] for e in els])
d = np.linalg.norm(cart[pairs[:, 0]] - cart[pairs[:, 1]], axis=1)
ok = (d < rad[pairs[:, 0]] + rad[pairs[:, 1]] + 0.45) & ~((els[pairs[:, 0]] == "H") & (els[pairs[:, 1]] == "H"))
bonds = pairs[ok]
n = len(cart)
ncomp, lab = connected_components(coo_matrix((np.ones(len(bonds)), (bonds[:, 0], bonds[:, 1])), shape=(n, n)), directed=False)
sizes = np.bincount(lab)

def write_xyz(path, idx, title):
    idx = list(idx)
    c = cart[idx] - cart[idx].mean(0)
    with open(path, "w") as fh:
        fh.write(f"{len(idx)}\n{title}\n")
        for e, (x, y, z) in zip(els[idx], c):
            fh.write(f"{e} {x:.4f} {y:.4f} {z:.4f}\n")
    return cart[idx].mean(0)

# --- SBU: ammonium N + Cl⁻ connected by N–H···Cl contacts (N···Cl < 3.45 Å)
ion = np.where((els == "Cl") | ((els == "N") & (np.bincount(bonds[:, 0][els[bonds[:, 1]] == "H"], minlength=n) + np.bincount(bonds[:, 1][els[bonds[:, 0]] == "H"], minlength=n) >= 3)))[0]
it = cKDTree(cart[ion])
ip = np.array([(a, b) for a, b in it.query_pairs(3.45) if {els[ion[a]], els[ion[b]]} == {"N", "Cl"}])
nc, il = connected_components(coo_matrix((np.ones(len(ip)), (ip[:, 0], ip[:, 1])), shape=(len(ion), len(ion))), directed=False)
centre = np.array([0.5, 0.5, 0.5]) @ orth.T
best = None
for k in range(nc):
    members = ion[il == k]
    if len(members) == 24 and (els[members] == "Cl").sum() == 12:
        dist = np.linalg.norm(cart[members].mean(0) - centre)
        if best is None or dist < best[0]: best = (dist, members)
assert best, "no N12Cl12 cluster found"
cluster = best[1]
mols = set(lab[cluster])
sbu = [i for i in range(n) if lab[i] in mols]
write_xyz(OUT + "tahpme-sbu.xyz", sbu, "TAHPMe.N12Cl12 SBU: one N12Cl12 cluster with its 12 TAHPMe cations")
print("SBU atoms", len(sbu), "molecules", len(mols))

# --- unit cell: whole molecules (and Cl⁻) whose centroid falls inside the origin cell
cent = np.array([frac[lab == k].mean(0) for k in range(ncomp)])
inside = np.all((cent >= 0) & (cent < 1), axis=1)
cellidx = [i for i in range(n) if inside[lab[i]]]
origin = write_xyz(OUT + "tahpme-cell.xyz", cellidx, "TAHPMe.N12Cl12 unit cell (heptane omitted)")
print("cell atoms", len(cellidx))

# cell box corners in the same centred frame as tahpme-cell.xyz
corners = [((np.array(c) @ orth.T) - origin).round(3).tolist() for c in itertools.product((0, 1), repeat=3)]
json.dump({"cellCorners": corners, "a": cell.a, "b": cell.b, "c": cell.c, "spacegroup": st.spacegroup.hm},
          open(OUT + "tahpme-cell.json", "w"))
