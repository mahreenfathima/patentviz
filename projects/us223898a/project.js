window.PROJECT = {
 "title": "Electric lamp",
 "mode": "world",
 "world": {
  "bg": "stage"
 },
 "aspect": "16x9",
 "aspects": [
  "16x9"
 ],
 "theme": "light",
 "palette": {
  "paper": "#f1f5ec",
  "stage": "#f1f5ec",
  "ink": "#14301f",
  "accent": "#d2664a",
  "hi": "#f4d35e",
  "sky": "#a8d8ea",
  "mint": "#b7e4c7",
  "lilac": "#d0c4f0"
 },
 "fonts": {
  "head": "Bricolage Grotesque:wght@400;700;800",
  "text": "Bricolage Grotesque:wght@400;500;700",
  "ui": "Bricolage Grotesque:wght@400;500;700"
 },
 "boil": 8,
 "audio": "voice/voiceover.wav",
 "assets": {
  "d1": {
   "file": "drawing-1-raw.png",
   "label": "Patent drawing 1",
   "kind": "photo",
   "ratio": 0.681,
   "fromPatent": true,
   "tint": false
  },
  "d2": {
   "file": "drawing-2.png",
   "label": "Patent drawing 2",
   "kind": "cutout",
   "ratio": 0.686,
   "fromPatent": true,
   "tint": false
  },
  "p1": {
   "file": "photo-1.png",
   "label": "Product image (Google Images, not from the patent)",
   "kind": "cutout",
   "ratio": 0.665,
   "tint": false
  },
  "p2": {
   "file": "photo-2.png",
   "label": "Product image (Google Images, not from the patent)",
   "kind": "cutout",
   "ratio": 0.598,
   "tint": false
  },
  "p3": {
   "file": "photo-b-1.png",
   "label": "Product image (Google Images, not from the patent)",
   "kind": "cutout",
   "ratio": 1.604,
   "tint": false
  },
  "p4": {
   "file": "photo-b-2.png",
   "label": "Product image (Google Images, not from the patent)",
   "kind": "cutout",
   "ratio": 0.591,
   "tint": false
  },
  "d1a": {
   "file": "drawing-annotated.svg",
   "label": "Annotated patent drawing",
   "kind": "cutout",
   "ratio": 0.862,
   "tint": false
  },
  "holder": {
   "file": "holder.png",
   "label": "Thomas Alva Edison",
   "kind": "photo",
   "ratio": 1.004,
   "tint": false
  },
  "inventor": {
   "file": "inventor.jpg",
   "label": "Thomas Alva Edison",
   "kind": "photo",
   "ratio": 0.781,
   "tint": false
  }
 },
 "scenes": [
  {
   "narration": "Imagine a world without constant light.",
   "cam": {
    "x": 50,
    "y": 31,
    "z": 1,
    "move": "cut",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [
    {
     "k": "deco",
     "type": "blob",
     "x": 77,
     "y": 31,
     "w": 44,
     "c": "sky",
     "clean": 1,
     "spin": 25,
     "spinD": 40,
     "in": "fade",
     "z": 1
    },
    {
     "k": "deco",
     "type": "streaks",
     "x": 58,
     "y": 16,
     "w": 9,
     "c": "ink",
     "clean": 1,
     "draw": 1,
     "dd": 0.6,
     "at": 0.4,
     "z": 6
    },
    {
     "a": "p1",
     "fx": "sticker",
     "x": 77,
     "y": 31,
     "w": 25.270000000000003,
     "r": -5,
     "in": "pop",
     "at": 0.5,
     "z": 5
    },
    {
     "k": "deco",
     "type": "sparkle",
     "x": 92,
     "y": 14,
     "w": 5,
     "c": "accent",
     "clean": 1,
     "spin": 90,
     "spinD": 6,
     "at": 0.9,
     "z": 6
    },
    {
     "a": "p3",
     "fx": "sticker",
     "x": 50,
     "y": 51,
     "w": 11,
     "r": 8,
     "in": "pop",
     "at": 0.9,
     "z": 3
    }
   ],
   "text": [
    {
     "t": "ILLUMINATE THE *WORLD* WITH EDISON'S LAMP",
     "s": "mt",
     "x": 10,
     "y": 26,
     "fs": 5.2,
     "mw": 46,
     "al": "l",
     "stag": 0.05,
     "c": "#1b1a17"
    },
    {
     "t": "PATENT US223898A",
     "s": "tg",
     "x": 10,
     "y": 46,
     "fs": 1.3,
     "al": "l",
     "at": 1.3,
     "c": "#1b1a17"
    }
   ],
   "dur": 4.5,
   "sub": "Imagine a world without constant light."
  },
  {
   "narration": "Before Edison, reliable indoor lighting was a struggle. Flickering gas lamps were common.",
   "cam": {
    "x": 150,
    "y": 31,
    "z": 1,
    "move": "zoom",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [
    {
     "k": "deco",
     "type": "blob",
     "x": 150,
     "y": 30,
     "w": 72,
     "c": "mint",
     "clean": 1,
     "spin": -15,
     "spinD": 50,
     "in": "fade",
     "z": 1
    },
    {
     "k": "deco",
     "type": "streaks",
     "x": 128,
     "y": 13,
     "w": 8,
     "c": "ink",
     "clean": 1,
     "draw": 1,
     "dd": 0.6,
     "at": 0.35,
     "z": 6
    },
    {
     "k": "deco",
     "type": "sparkle",
     "x": 112,
     "y": 46,
     "w": 4,
     "c": "accent",
     "clean": 1,
     "spin": 90,
     "spinD": 5,
     "at": 0.7,
     "z": 6
    },
    {
     "k": "deco",
     "type": "sparkle",
     "x": 188,
     "y": 16,
     "w": 3.5,
     "c": "ink",
     "clean": 1,
     "spin": -90,
     "spinD": 5,
     "at": 0.9,
     "z": 6
    },
    {
     "k": "deco",
     "type": "underline",
     "x": 150,
     "y": 41,
     "w": 34,
     "c": "accent",
     "clean": 1,
     "draw": 1,
     "dd": 0.8,
     "at": 1.3,
     "z": 6
    }
   ],
   "text": [
    {
     "t": "01 — THE PROBLEM",
     "s": "ml",
     "x": 150,
     "y": 8,
     "fs": 1.5,
     "in": "fade",
     "c": "#1b1a17"
    },
    {
     "t": "Reliable, long-lasting *light* was elusive; *darkness* prevailed.",
     "s": "mt",
     "x": 150,
     "y": 27,
     "fs": 4.2,
     "mw": 46,
     "stag": 0.05,
     "in": "fade",
     "c": "#1b1a17"
    }
   ],
   "dur": 7.3,
   "sub": "Before Edison, reliable indoor lighting was a struggle. Flickering gas lamps were common."
  },
  {
   "narration": "This patent introduced the practical electric lamp. It transformed daily life globally.",
   "cam": {
    "x": 250,
    "y": 31,
    "z": 1,
    "move": "spiral",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [
    {
     "k": "deco",
     "type": "blob",
     "x": 250,
     "y": 33,
     "w": 46,
     "c": "sky",
     "clean": 1,
     "spin": 25,
     "spinD": 40,
     "in": "fade",
     "z": 1
    },
    {
     "a": "p1",
     "fx": "sticker",
     "x": 250,
     "y": 33,
     "w": 26.6,
     "in": "pop",
     "at": 0.4,
     "z": 3
    }
   ],
   "text": [
    {
     "t": "02 — THE INVENTION",
     "s": "ml",
     "x": 250,
     "y": 7,
     "fs": 1.5,
     "in": "fade",
     "c": "#1b1a17"
    },
    {
     "t": "ELECTRIC LAMP",
     "s": "tg",
     "x": 250,
     "y": 13,
     "fs": 2.4,
     "mw": 60,
     "in": "fade",
     "at": 0.2,
     "c": "#1b1a17"
    }
   ],
   "minDur": 0,
   "dur": 6.9,
   "sub": "This patent introduced the practical electric lamp. It transformed daily life globally."
  },
  {
   "narration": "The blueprint shows the core design of this revolutionary device.",
   "cam": {
    "x": 350,
    "y": 31,
    "z": 1,
    "move": "swing",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [
    {
     "k": "deco",
     "type": "blob",
     "x": 350,
     "y": 30,
     "w": 54,
     "c": "lilac",
     "clean": 1,
     "spin": 25,
     "spinD": 40,
     "in": "fade",
     "z": 1
    },
    {
     "a": "d1a",
     "fx": "glow",
     "x": 350,
     "y": 29,
     "w": 24.136,
     "in": "pop",
     "at": 0.3,
     "z": 4
    }
   ],
   "text": [
    {
     "t": "03 — FROM THE PATENT FILING",
     "s": "ml",
     "x": 350,
     "y": 8,
     "fs": 1.4,
     "in": "fade",
     "c": "#1b1a17"
    },
    {
     "t": "Edison's patent drawing for an electric light bulb.",
     "s": "mb",
     "x": 350,
     "y": 49,
     "fs": 1.5,
     "mw": 60,
     "in": "fade",
     "at": 1.1,
     "c": "#1b1a17"
    }
   ],
   "dur": 5.9,
   "sub": "The blueprint shows the core design of this revolutionary device."
  },
  {
   "narration": "An electric current is supplied to the lamp.",
   "cam": {
    "x": 420,
    "y": 31,
    "z": 2.2,
    "move": "arc",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [
    {
     "k": "deco",
     "type": "blob",
     "x": 460,
     "y": 30,
     "w": 134,
     "c": "mint",
     "clean": 1,
     "spin": 25,
     "spinD": 40,
     "in": "fade",
     "z": 1
    },
    {
     "k": "steps",
     "x": 460,
     "y": 30,
     "w": 120,
     "fs": 1.5,
     "gap": 4.6,
     "items": [
      {
       "t": "Current flows",
       "d": "Electricity powers the lamp's filament."
      },
      {
       "t": "Filament heats",
       "d": "Metallic filament glows incandescently."
      },
      {
       "t": "Light emits",
       "d": "Bright, steady illumination is produced."
      }
     ],
     "at": 0.3,
     "z": 5
    }
   ],
   "text": [
    {
     "t": "04 — HOW IT WORKS",
     "s": "tg",
     "x": 420,
     "y": 21,
     "fs": 1.6,
     "in": "fade",
     "c": "#1b1a17"
    }
   ],
   "dur": 5,
   "sub": "An electric current is supplied to the lamp."
  },
  {
   "narration": "This current heats a metallic filament inside.",
   "cam": {
    "x": 460,
    "y": 31,
    "z": 2.2,
    "move": "whip",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [],
   "text": [],
   "dur": 4.6,
   "sub": "This current heats a metallic filament inside."
  },
  {
   "narration": "The hot filament then emits a steady, bright light.",
   "cam": {
    "x": 500,
    "y": 31,
    "z": 2.2,
    "move": "whip",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [],
   "text": [],
   "dur": 5.5,
   "sub": "The hot filament then emits a steady, bright light."
  },
  {
   "narration": "Search interest for electric lamps has remained historically significant.",
   "cam": {
    "x": 600,
    "y": 31,
    "z": 1,
    "move": "drop",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [
    {
     "k": "deco",
     "type": "blob",
     "x": 600,
     "y": 32,
     "w": 70,
     "c": "mint",
     "clean": 1,
     "spin": 15,
     "spinD": 40,
     "in": "fade",
     "z": 1
    },
    {
     "k": "chart",
     "type": "line",
     "flat": 1,
     "title": "Search interest over time",
     "data": [
      {
       "l": "Oct 5 – 11, 2025",
       "v": 5
      },
      {
       "l": "Dec 7 – 13, 2025",
       "v": 6
      },
      {
       "l": "Feb 8 – 14, 2026",
       "v": 13
      },
      {
       "l": "Apr 12 – 18, 2026",
       "v": 100
      },
      {
       "l": "Jun 14 – 20, 2026",
       "v": 20
      },
      {
       "l": "Aug 16 – 22, 2026",
       "v": 14
      }
     ],
     "x": 600,
     "y": 32,
     "w": 52,
     "hgt": 26,
     "at": 0.4
    }
   ],
   "text": [
    {
     "t": "05 — THE MOMENTUM",
     "s": "tg",
     "x": 600,
     "y": 8,
     "fs": 1.6,
     "in": "fade",
     "c": "#1b1a17"
    }
   ],
   "dur": 5.5,
   "sub": "Search interest for electric lamps has remained historically significant."
  },
  {
   "narration": "Thomas Alva Edison invented and held this patent. He filed it from Menlo Park.",
   "cam": {
    "x": 700,
    "y": 31,
    "z": 1,
    "move": "arc",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [
    {
     "k": "deco",
     "type": "blob",
     "x": 700,
     "y": 30,
     "w": 52,
     "c": "lilac",
     "clean": 1,
     "spin": -10,
     "spinD": 40,
     "in": "fade",
     "z": 1
    },
    {
     "a": "inventor",
     "fx": "card",
     "x": 676,
     "y": 27,
     "w": 14.058,
     "r": -3,
     "in": "pop",
     "at": 0.3,
     "z": 4
    },
    {
     "a": "holder",
     "fx": "card",
     "x": 724,
     "y": 27,
     "w": 16,
     "r": 3,
     "in": "pop",
     "at": 0.6,
     "z": 5
    },
    {
     "k": "deco",
     "type": "sparkle",
     "x": 734,
     "y": 14,
     "w": 4,
     "c": "accent",
     "clean": 1,
     "spin": 90,
     "spinD": 5,
     "at": 0.8,
     "z": 6
    }
   ],
   "text": [
    {
     "t": "06 — WHO MADE IT",
     "s": "ml",
     "x": 700,
     "y": 8,
     "fs": 1.5,
     "in": "fade",
     "c": "#1b1a17"
    },
    {
     "t": "Thomas Alva Edison",
     "s": "mt",
     "x": 700,
     "y": 42,
     "fs": 2.4,
     "mw": 56,
     "stag": 0.03,
     "in": "fade",
     "c": "#1b1a17"
    },
    {
     "t": "Holder: Thomas Alva Edison",
     "s": "tg",
     "x": 700,
     "y": 50,
     "fs": 1.2,
     "at": 1.2,
     "c": "#1b1a17"
    }
   ],
   "dur": 7.8,
   "sub": "Thomas Alva Edison invented and held this patent. He filed it from Menlo Park."
  },
  {
   "narration": "This patent had 1 inventor and took 1 year to grant.",
   "cam": {
    "x": 800,
    "y": 31,
    "z": 1,
    "move": "arc",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [
    {
     "k": "deco",
     "type": "cardv",
     "x": 786,
     "y": 31,
     "w": 22,
     "shadow": 1,
     "in": "pop",
     "at": 0.2,
     "z": 3
    },
    {
     "k": "deco",
     "type": "underline",
     "x": 786,
     "y": 29.8,
     "w": 9,
     "c": "accent",
     "clean": 1,
     "draw": 1,
     "dd": 0.6,
     "at": 0.9,
     "z": 5
    },
    {
     "k": "deco",
     "type": "doc",
     "x": 786,
     "y": 42,
     "w": 4.4,
     "c": "ink",
     "clean": 1,
     "draw": 1,
     "dd": 0.8,
     "at": 1.2,
     "z": 5
    },
    {
     "k": "deco",
     "type": "cardv",
     "x": 814,
     "y": 31,
     "w": 22,
     "shadow": 1,
     "in": "pop",
     "at": 0.4,
     "z": 3
    },
    {
     "k": "deco",
     "type": "underline",
     "x": 814,
     "y": 29.8,
     "w": 9,
     "c": "accent",
     "clean": 1,
     "draw": 1,
     "dd": 0.6,
     "at": 1.1,
     "z": 5
    },
    {
     "k": "deco",
     "type": "bulb",
     "x": 814,
     "y": 42,
     "w": 4.4,
     "c": "ink",
     "clean": 1,
     "draw": 1,
     "dd": 0.8,
     "at": 1.4,
     "z": 5
    }
   ],
   "text": [
    {
     "t": "07 — BY THE NUMBERS",
     "s": "tg",
     "x": 800,
     "y": 8,
     "fs": 1.6,
     "in": "fade",
     "c": "#1b1a17"
    },
    {
     "t": "0",
     "s": "ms",
     "x": 786,
     "y": 24.5,
     "fs": 9.5,
     "c": "#1b1a17",
     "count": {
      "to": 1,
      "d": 1.4
     },
     "in": "fade",
     "at": 0.4,
     "z": 6
    },
    {
     "t": "INVENTOR",
     "s": "ml",
     "x": 786,
     "y": 34.5,
     "fs": 1.15,
     "mw": 20,
     "c": "#1b1a17",
     "in": "fade",
     "at": 0.7,
     "z": 6
    },
    {
     "t": "0",
     "s": "ms",
     "x": 814,
     "y": 24.5,
     "fs": 9.5,
     "c": "#1b1a17",
     "count": {
      "to": 1,
      "d": 1.4
     },
     "in": "fade",
     "at": 0.65,
     "z": 6
    },
    {
     "t": "YEARS TO GRANT",
     "s": "ml",
     "x": 814,
     "y": 34.5,
     "fs": 1.15,
     "mw": 20,
     "c": "#1b1a17",
     "in": "fade",
     "at": 0.95,
     "z": 6
    }
   ],
   "dur": 6.4,
   "sub": "This patent had 1 inventor and took 1 year to grant."
  },
  {
   "narration": "Explore the full patent for more details.",
   "cam": {
    "x": 920,
    "y": 31,
    "z": 1,
    "move": "zoom",
    "drift": [
     0.6,
     0
    ],
    "push": 1.02
   },
   "layers": [
    {
     "k": "deco",
     "type": "blob",
     "x": 942,
     "y": 31,
     "w": 36,
     "c": "hi",
     "clean": 1,
     "spin": 20,
     "spinD": 35,
     "in": "fade",
     "z": 1
    },
    {
     "k": "deco",
     "type": "cardh",
     "x": 899,
     "y": 31,
     "w": 50,
     "shadow": 1,
     "in": "pop",
     "at": 0.2,
     "z": 3
    },
    {
     "k": "deco",
     "type": "sparkle",
     "x": 882,
     "y": 14,
     "w": 4,
     "c": "accent",
     "clean": 1,
     "spin": 90,
     "spinD": 5,
     "at": 0.6,
     "z": 6
    },
    {
     "k": "deco",
     "type": "sparkle",
     "x": 950,
     "y": 52,
     "w": 3.5,
     "c": "ink",
     "clean": 1,
     "spin": -90,
     "spinD": 5,
     "at": 1.1,
     "z": 6
    },
    {
     "a": "p2",
     "fx": "sticker",
     "x": 942,
     "y": 31,
     "w": 11.959999999999999,
     "in": "pop",
     "at": 0.5,
     "z": 5
    },
    {
     "a": "inventor",
     "fx": "card",
     "x": 962,
     "y": 17,
     "w": 8.591000000000001,
     "r": -4,
     "in": "pop",
     "at": 1,
     "z": 6
    },
    {
     "a": "holder",
     "fx": "card",
     "x": 960,
     "y": 43,
     "w": 11.044,
     "r": 5,
     "in": "pop",
     "at": 1.2,
     "z": 6
    }
   ],
   "text": [
    {
     "t": "FULL PATENT LINKED BELOW",
     "s": "mt",
     "x": 880,
     "y": 21,
     "fs": 2.4,
     "mw": 38,
     "al": "l",
     "stag": 0.03,
     "at": 0.4,
     "c": "#1b1a17"
    },
    {
     "t": "Thomas Alva Edison · US223898A",
     "s": "tg",
     "x": 880,
     "y": 30,
     "fs": 1.2,
     "al": "l",
     "at": 1,
     "c": "#1b1a17"
    },
    {
     "t": "Educational summary — not legal advice",
     "s": "mb",
     "x": 880,
     "y": 40,
     "fs": 1.1,
     "mw": 38,
     "al": "l",
     "at": 1.5,
     "c": "#1b1a17"
    }
   ],
   "dur": 4.6,
   "sub": "Explore the full patent for more details."
  }
 ]
};
