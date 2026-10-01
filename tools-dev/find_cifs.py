"""Scan local CIFs for the CCDC deposition numbers cited in the selected papers."""
import os, re, json, sys
PAPERS = {
  "natchem26": list(range(2515978, 2515989)),
  "chem23": [2193724, 2193725],
  "jacs25": [2372338, 2372339, 2390659, 2390660, 2390661],
  "jacs24mp": [2324469, 2324470, 2324471],
  "jacs22": [2142981],
  "jacs24co": [2206002, 2206003, 2206005, 2206006, 2206007, 2206008, 2206009, 2348552],
}
want = {n: k for k, v in PAPERS.items() for n in v}
pat = re.compile(rb"(?:depnum_ccdc_archive|CCDC)[^\n]{0,30}?(\d{7})")
hits = {}
for base in [r"D:\AIC_files"]:
    for dp, dn, fn in os.walk(base):
        if "site-packages" in dp or "olex2-win64" in dp: continue
        for f in fn:
            if not f.lower().endswith(".cif"): continue
            p = os.path.join(dp, f)
            try:
                with open(p, "rb") as fh: head = fh.read(400000)
            except Exception: continue
            for m in pat.finditer(head):
                n = int(m.group(1))
                if n in want: hits.setdefault(n, []).append(p)
for n in sorted(want):
    print(want[n], n, len(hits.get(n, [])), (hits.get(n) or [""])[0][-110:])
json.dump({str(k): v for k, v in hits.items()}, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
