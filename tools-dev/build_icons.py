"""Favicon (octahedral cage motif) and the 1200x630 social-preview card."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ACCENT, INK, MUTED, BG = (181, 83, 47), (31, 30, 28), (107, 104, 96), (248, 247, 244)
# octahedron: top/bottom apex + equatorial parallelogram (D is the far vertex)
T, Bm = (256, 92), (256, 420)
A, B, C, D = (112, 262), (236, 334), (400, 250), (276, 180)
FRONT = [(T, A), (T, B), (T, C), (Bm, A), (Bm, B), (Bm, C), (A, B), (B, C)]
BACK = [(T, D), (Bm, D), (C, D), (D, A)]

def icon(size):
    s = 4  # supersample
    im = Image.new("RGBA", (512 * s, 512 * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, 512 * s - 1, 512 * s - 1], radius=112 * s, fill=ACCENT)
    P = lambda p: (p[0] * s, p[1] * s)
    for a, b in BACK:
        d.line([P(a), P(b)], fill=(255, 255, 255, 120), width=12 * s)
    for a, b in FRONT:
        d.line([P(a), P(b)], fill=(255, 255, 255, 255), width=20 * s)
    for p, r, alpha in [(D, 20, 150), (T, 30, 255), (Bm, 30, 255), (A, 30, 255), (B, 30, 255), (C, 30, 255)]:
        x, y = P(p)
        d.ellipse([x - r * s, y - r * s, x + r * s, y + r * s], fill=(255, 255, 255, alpha))
    return im.resize((size, size), Image.LANCZOS)

icon(32).save("favicon-32.png")
icon(180).save("apple-touch-icon.png")
icon(512).save("images/icon-512.png")
icon(48).save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# matching SVG
lines = "".join(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#fff" stroke-opacity=".47" stroke-width="12"/>' for a, b in BACK)
lines += "".join(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#fff" stroke-width="20" stroke-linecap="round"/>' for a, b in FRONT)
dots = f'<circle cx="{D[0]}" cy="{D[1]}" r="20" fill="#fff" fill-opacity=".6"/>' + "".join(
    f'<circle cx="{p[0]}" cy="{p[1]}" r="30" fill="#fff"/>' for p in (T, Bm, A, B, C))
open("favicon.svg", "w").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#b5532f"/>{lines}{dots}</svg>\n')

# ---- social card 1200x630
W, H = 1200, 630
card = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(card)
F = "C:/Windows/Fonts/"
eyebrow = ImageFont.truetype(F + "segoeui.ttf", 22)
name = ImageFont.truetype(F + "georgia.ttf", 84)
cn = ImageFont.truetype(F + "msyhl.ttc", 40)
body = ImageFont.truetype(F + "georgiai.ttf", 30)
url = ImageFont.truetype(F + "segoeuib.ttf", 24)

x = 72
card.paste(icon(64).convert("RGB"), (x, 70), icon(64))
d.text((x, 172), "POSTDOCTORAL RESEARCH ASSOCIATE", font=eyebrow, fill=MUTED)
d.text((x, 202), "UNIVERSITY OF LIVERPOOL", font=eyebrow, fill=MUTED)
d.text((x, 240), "Yu-Lin Lu", font=name, fill=INK)
d.text((x, 345), "鲁玉麟", font=cn, fill=MUTED)
for i, line in enumerate(["Supramolecular chemistry,", "self-assembly and", "crystal engineering"]):
    d.text((x, 420 + i * 40), line, font=body, fill=INK)
d.text((x, 556), "luylin5.github.io", font=url, fill=ACCENT)

# TOC graphic on a white card with a soft shadow
toc = Image.open("images/toc/natchem-2026.webp").convert("RGB")
tw = 560
toc = toc.resize((tw, round(toc.height * tw / toc.width)), Image.LANCZOS)
pad = 22
bx, by = W - tw - 2 * pad - 60, (H - toc.height - 2 * pad) // 2
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([bx + 6, by + 18, bx + tw + 2 * pad + 6, by + toc.height + 2 * pad + 18], 22, fill=(60, 40, 20, 70))
card.paste(shadow.filter(ImageFilter.GaussianBlur(18)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(18)))
d.rounded_rectangle([bx, by, bx + tw + 2 * pad, by + toc.height + 2 * pad], 22, fill="white", outline=(228, 225, 218), width=2)
card.paste(toc, (bx + pad, by + pad))
card.save("images/og-card.png", optimize=True)
print("done")
