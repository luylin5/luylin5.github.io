// Gallery content, shown on the rotating cylinder (items repeat to fill it; more items = less repetition).
//   src      image or video file
//   type     "video" for a muted, looping clip (default: image)
//   preview  optional short clip looped on the card; `src` (full video) plays when enlarged
//   poster   still frame shown before a video loads
//   aspect   width / height of the media (default 1.5)
//   link     optional "Read the paper" link in the enlarged view
// Keep images ~1000–1200px on the long side (WebP) and videos short, silent and < 5 MB.
window.GALLERY_ITEMS = [
  {
    src: "images/gallery/nmof-ionic-clusters.mp4",
    preview: "images/gallery/nmof-ionic-clusters-preview.mp4",
    poster: "images/gallery/nmof-ionic-clusters-poster.webp",
    type: "video",
    aspect: 1,
    title: "Ionic clusters as SBUs — animation",
    caption: "Ionic clusters as high-connectivity secondary building units for crystalline porous organic salts. Nature Chemistry, 2026.",
    link: "https://doi.org/10.1038/s41557-026-02248-w",
  },
  {
    src: "images/gallery/cover-accounts-2024.webp",
    aspect: 827 / 1100,
    title: "Cover · Acc. Chem. Res. 2024",
    caption: "Activating Metal–Organic Cages by Incorporating Functional M(ImPhen)₃ Metalloligands. Accounts of Chemical Research, Vol. 57, Issue 22.",
    link: "https://doi.org/10.1021/acs.accounts.4c00467",
  },
  {
    src: "images/gallery/cover-acscatal-2024.webp",
    aspect: 827 / 1100,
    title: "Cover · ACS Catal. 2024",
    caption: "Anion-mediated allosteric catalysis of [2+2] photocycloaddition based on a flexible metallo-amine cage. ACS Catalysis, Vol. 14, Issue 1.",
    link: "https://doi.org/10.1021/acscatal.3c04593",
  },
  {
    src: "images/gallery/cover-chemcomm-2025.webp",
    aspect: 840 / 1100,
    title: "Cover · ChemComm 2025",
    caption: "Feature article: Self-assembly under continuous flow conditions (Slater et al.). ChemComm, Vol. 61, Issue 56.",
  },
  {
    src: "images/gallery/cage-co-labile-static.webp",
    aspect: 1400 / 845,
    title: "Labile ⇄ static Co cages",
    caption: "Redox switching between Co(II) and Co(III) switches Co₈Pd₆ cages from labile to static. J. Am. Chem. Soc. 2024.",
    link: "https://doi.org/10.1021/jacs.4c06102",
  },
  {
    src: "images/gallery/cage-multipocket.webp",
    aspect: 1400 / 788,
    title: "Multipocket cage",
    caption: "A multipocket metal–organic cage that binds high-order bulky and drug guests. J. Am. Chem. Soc. 2024.",
    link: "https://doi.org/10.1021/jacs.4c05758",
  },
  {
    src: "images/gallery/cage-structure.webp",
    aspect: 342 / 374,
    title: "Metal–organic cage",
    caption: "",
  },
];
