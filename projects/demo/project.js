// WORLD demo ("board"): one big canvas, the camera travels between spots. Base values = 9:16, h:{} = 16:9.
// Assets are missing on purpose: labelled placeholders show until real images exist.
window.PROJECT = {
  title: "One bean, one cup", mode: "world",
  palette: { paper: "#f2ead8", ink: "#1b1a17", accent: "#e8452c", hi: "#ffd447" },
  fonts: { head: "Anton", text: "Special Elite" },
  world: { bg: "paper" }, boil: 8,
  assets: {
    a1: { file: "01-cherry-branch.png", label: "Coffee cherry branch, cutout", kind: "cutout", ratio: 1 },
    a2: { file: "02-coffee-belt-map.png", label: "Vintage world map, coffee belt", kind: "photo", ratio: 1.5 },
    a3: { file: "03-bean-sack.png", label: "Burlap sack of beans, cutout", kind: "cutout", ratio: 1 },
    a4: { file: "04-espresso-cup.png", label: "Steaming espresso cup, cutout", kind: "cutout", ratio: 1 }
  },
  scenes: [
    { dur: 3.4, cam: { x: 0, y: 0, z: 1, drift: [0, -2] },
      layers: [
        { k: "sheet", x: 0, y: 0, w: 86, hgt: 112, c: "kraft", r: -1.5, h: { w: 88, hgt: 48 } },
        { a: "a1", x: 0, y: 6, w: 62, r: -4, float: 1, h: { x: -18, y: 0, w: 30 } }],
      text: [
        { t: "ONE BEAN", s: "head", x: 0, y: -40, fs: 9, r: -2, at: .2, h: { x: 24, y: -8, fs: 6 } },
        { t: "7,000 miles to your cup", s: "note", x: 0, y: 44, fs: 5.5, r: 2, at: 1.1, h: { x: 24, y: 10, fs: 2.8 } }] },
    { dur: 3.8, cam: { x: 95, y: 40, z: 1.15, move: "glide", h: { x: 75, y: 10, z: 1 } },
      layers: [
        { k: "sheet", x: 95, y: 40, w: 92, hgt: 84, c: "#fffdf5", r: 1.5, h: { x: 75, y: 10, w: 88, hgt: 48 } },
        { k: "line", from: [22, 20], to: [58, 36], c: "accent", at: .1, h: { from: [-5, 3], to: [38, 9] } },
        { a: "a2", x: 95, y: 40, w: 80, r: 2, in: "tear", h: { x: 62, y: 10, w: 46 } }],
      text: [{ t: "THE COFFEE BELT", s: "hi", x: 95, y: 2, fs: 7.5, r: -1, h: { x: 104, y: 6, fs: 4, mw: 30 } }] },
    { dur: 3.6, cam: { x: 20, y: 115, z: 1, move: "arc", mv: 1.4, h: { x: 150, y: -14 } },
      layers: [
        { k: "sheet", x: 20, y: 115, w: 88, hgt: 112, c: "ink", r: -1, h: { x: 150, y: -14, w: 88, hgt: 48 } },
        { k: "line", from: [80, 68], to: [34, 92], c: "accent", at: .1, h: { from: [86, 14], to: [116, -8] } },
        { a: "a3", x: 20, y: 124, w: 62, in: "drop", h: { x: 132, y: -12, w: 28 } }],
      text: [
        { t: "70%", s: "stat", x: 20, y: 84, fs: 20, h: { x: 166, y: -20, fs: 12 } },
        { t: "grown by small farms", s: "head", x: 20, y: 160, fs: 6, stag: .1, h: { x: 166, y: -4, fs: 3.4, mw: 30 } }] },
    { dur: 3.8, cam: { x: -70, y: 150, z: 1.1, move: "glide", h: { x: 225, y: 16, z: 1 } },
      layers: [
        { k: "sheet", x: -70, y: 150, w: 84, hgt: 112, c: "accent", r: 1.5, h: { x: 225, y: 16, w: 88, hgt: 48 } },
        { k: "line", from: [-5, 130], to: [-38, 142], c: "ink", at: .1, h: { from: [148, 0], to: [190, 14] } },
        { a: "a4", x: -70, y: 154, w: 60, r: 3, float: 1, h: { x: 205, y: 16, w: 28 } }],
      text: [{ t: "ROASTED. GROUND. POURED.", s: "head", x: -70, y: 112, fs: 7.5, r: 1, stag: .12, h: { x: 244, y: 12, fs: 4, mw: 30 } }] },
    { dur: 3.6, cam: { x: 10, y: 88, z: .36, move: "arc", mv: 1.7, push: 1.03, h: { x: 112, y: 4, z: .3 } },
      layers: [],
      text: [{ t: "ONE BEAN. ONE CUP.", s: "head", x: 50, y: 88, fs: 8, pin: true, at: 1.8, h: { fs: 5 } }] }
  ]
};
