// Demo project. Assets are missing on purpose: the engine shows labelled placeholders until real images exist.
window.PROJECT = {
  title: "One bean, one cup",
  palette: { paper: "#f2ead8", ink: "#1b1a17", accent: "#e8452c", hi: "#ffd447" },
  boil: 8,
  assets: {
    a1: { file: "01-cherry-branch.png", label: "Coffee cherry branch, cutout", kind: "cutout", ratio: 1 },
    a2: { file: "02-coffee-belt-map.png", label: "Vintage world map, coffee belt", kind: "photo", ratio: 1.5 },
    a3: { file: "03-bean-sack.png", label: "Burlap sack of beans, cutout", kind: "cutout", ratio: 1 },
    a4: { file: "04-espresso-cup.png", label: "Steaming espresso cup, cutout", kind: "cutout", ratio: 1 }
  },
  scenes: [
    { dur: 3.2, bg: "paper", cam: { s: [1, 1.08] },
      layers: [{ a: "a1", x: 50, y: 56, w: 70, r: -4, in: "pop", at: .3, float: 1, h: { x: 68, w: 34 } }],
      text: [{ t: "ONE BEAN", s: "head", x: 50, y: 17, fs: 9, r: -2, at: .1, h: { x: 28, y: 40, fs: 6.5 } },
             { t: "7,000 miles to your cup", s: "note", x: 50, y: 86, fs: 6, r: 2, at: 1, h: { x: 28, y: 66, fs: 3.6 } }] },
    { dur: 3.6, bg: "kraft", in: "wipe", cam: { s: [1.02, 1.1], x: [0, -2] },
      layers: [{ a: "a2", x: 50, y: 50, w: 94, r: 2, in: "tear", at: .3, h: { x: 66, w: 56 } }],
      text: [{ t: "THE COFFEE BELT", s: "hi", x: 50, y: 15, fs: 8, r: -1, at: .8, h: { x: 27, y: 42, fs: 5.5, mw: 40 } }] },
    { dur: 3.2, bg: "ink", in: "slide", cam: { s: [1, 1.06] },
      layers: [{ a: "a3", x: 50, y: 58, w: 74, in: "drop", at: .2, h: { x: 70, w: 34 } }],
      text: [{ t: "70%", s: "stat", x: 50, y: 20, fs: 22, at: .6, h: { x: 28, y: 40, fs: 16 } },
             { t: "grown by small farms", s: "head", x: 50, y: 84, fs: 6, at: 1, stag: .1, h: { x: 28, y: 68, fs: 3.8, mw: 40 } }] },
    { dur: 3.4, bg: "paper", in: "wipe", cam: { s: [1, 1.1], y: [0, -2] },
      layers: [{ a: "a4", x: 50, y: 56, w: 66, r: 3, in: "pop", at: .3, float: 1, h: { x: 68, w: 30 } }],
      text: [{ t: "ROASTED. GROUND. POURED.", s: "head", x: 50, y: 17, fs: 7.5, r: 1, at: .2, stag: .12, h: { x: 28, y: 42, fs: 5, mw: 42 } }] }
  ]
};
