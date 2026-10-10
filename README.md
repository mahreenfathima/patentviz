# Patent Viz

Turn any patent into a 55-second animated explainer video (paper-cutout look, HTML + GSAP, narrated) and a 4-page infographic PDF. Every fact on screen traces back to SerpApi data.

- **`cli/patentviz.js`**: the CLI. One patent in, one video and one infographic out.
- **`cli/export.py`**: renders the video to MP4 with ffmpeg.
- **`cli/pdf.py`**: renders the infographic to PDF.
- **`cli/cutout.py`**: removes plain backgrounds from drawings and photos.


---

## Why this is useful

Patents are public, dense, and rarely read outside a law firm. But "what does this patent actually do?" comes up constantly:

- **Founders and engineers** checking what is already filed before they build, or scoping around a competitor's claims.
- **Students and researchers** who need to understand prior art quickly.
- **Investors and journalists** who want to know what a company's IP covers without reading 20 pages of claims.
- **Patent holders** who want a short, shareable explainer of their own filing.

Patent Viz turns one lookup into a narrated video with the patent's own drawings, real filing data, and a walkthrough, plus a printable infographic.

---

## What it uses SerpApi for

Every fact on screen comes from one of these calls. Nothing is invented.

| SerpApi engine | What it is used for |
|---|---|
| `google_patents` | Searches Google Patents and lists real matches to pick from |
| `google_patents_details` | Title, abstract, claims, inventors, assignee, dates, country, and the patent's own drawings |
| `google` (web results) | Finds patent numbers people discuss for your topic, to sharpen the search |
| `google` (answer box) | A plain-language explainer for the "problem" part of the script |
| `google_trends` (`TIMESERIES`) | Search interest over time, drawn as a chart in the video |
| `google_images` | Drawing and product photos (clip-art filter off for real photos of the holder and inventors) |

The CLI prints each call as it runs, with a running count, and saves the patent data to `projects/<slug>/source.json`. SerpApi is not named in the video. The video shows the patent's own link instead.

---

## Run it

```bash
npm start
# or
node cli/patentviz.js
```

1. **Patent number or keyword**, for example `US11234567B2` or `electric bus charging`.
2. **Inventor name** (optional), to narrow the search.
3. **Pick a patent**, or choose *New search*.
4. **Focus**: How it works / Why it matters / Who made it / Balanced. The script and scene order follow your choice.
5. **Voiceover**: yes or no. Gemini TTS reads the script, scene by scene.
6. **Colour preset**: Sunny / Ocean / Berry / Custom.
7. **Export an MP4 now with ffmpeg?** y/n.
8. **Build a 4-page infographic PDF too?** y/n.

Groq writes the infographic text and the search expansion. Gemini writes the narration and checks the drawings. The video and PDF open when they are ready.

**Output**, in `projects/<slug>/`:

| File | What it is |
|---|---|
| `video.html` | The animated video. Open it in any browser. |
| `export/<slug>-16x9.mp4` | Final MP4 with voiceover (ffmpeg) |
| `<slug>-infographic.pdf` | 4-page infographic |
| `infographic.html` | Source for the PDF |
| `voice/voiceover.wav` | Narration |
| `source.json` | Every fact, with its SerpApi origin |
| `project.js` | Scene data the video reads |
| `assets/` | Drawings, annotated drawings, photos, cut-outs |

**Scope and honesty on screen:** the video says it is an explainer, not legal advice, and always shows the full patent link. Drawing labels are AI-read descriptions of the real figures, not statements about what the patent legally covers.

---

## Setup (once)

1. **Node 18 or newer** (24 recommended). No npm packages. `package.json` only marks the project as ES modules and adds `npm start`.
2. **Python 3.9 or newer** with Pillow and Playwright: `pip install -r requirements.txt`, then `python -m playwright install chromium`.
3. **ffmpeg** on your PATH, for MP4 export.
4. **Keys**: copy `.env.example` to `.env` and fill in:
   - `SERPAPI_API_KEY` (serpapi.com, free tier is 250 searches a month)
   - `GEMINI_API_KEY` (aistudio.google.com/apikey). Add `GEMINI_API_KEY_2`, `_3`, `_4` for rate-limit rotation.
   - `GROQ_API_KEY` (console.groq.com)
5. **Optional**: `pip install "rembg[cli]"` for AI background removal on busy photos. Set `VOX_REMBG=0` to skip it.

Never commit `.env`. `.gitignore` already excludes it, plus `projects/`.

Quick install, from the `patentviz` folder:

```bash
python3 -m venv .venv && source .venv/bin/activate    # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m playwright install chromium
cp .env.example .env                                   # then add your keys
npm start
```

ffmpeg is installed separately: `brew install ffmpeg` (macOS), `sudo apt install ffmpeg` (Ubuntu), or `winget install Gyan.FFmpeg` (Windows).

---

## Exporting an MP4

```bash
python3 cli/export.py <slug> --aspect 16x9 --fps 30
```

The exporter opens `video.html`, steps the timeline one frame at a time with `window.__seek(t)`, takes a screenshot of each frame, and pipes them into ffmpeg with the voiceover. Each frame is exact, so nothing is dropped. The encode is H.264 at CRF 18 with the medium preset. Rendering is slower than real time, so a 55-second video takes a few minutes. Use `--fps` to trade smoothness for speed.

## Exporting the PDF

```bash
python3 cli/pdf.py projects/<slug>/infographic.html projects/<slug>/<slug>-infographic.pdf
```

The PDF is sized to the infographic, with no margins.

---

## Layout

```
patentviz/
├── cli/
│   ├── patentviz.js      the CLI (search, prompts, script, voice, scene data)
│   ├── cutout.py         background cut-out and trim (Pillow)
│   ├── export.py         video.html -> MP4 (Playwright + ffmpeg)
│   └── pdf.py            HTML -> PDF (Playwright)
├── engine/
│   ├── index.html        the shared player: GSAP timeline, camera moves, charts, cards
│   └── vendor/gsap.min.js   GSAP 3.12.5, inlined into each video
├── projects/<slug>/      one folder per patent (generated, git-ignored)
├── .env.example          template for your keys
├── .gitignore
├── package.json          "type": "module" and npm start
├── requirements.txt      Python packages
└── README.md
```

---

## Notes and limits

- **Patent images**: the drawings are the patent's own published figures. Check the reuse terms for the jurisdiction before public distribution.
- **Trends** can return no data for very narrow queries. The video then uses a plain caption instead.
- **Light theme only** in this version.
- **Narration timing** follows the audio length per scene, not word-level timestamps, so cues can be a fraction of a second off.
- **Gemini 503 "high demand"** errors are not retried on a fallback model in this version. Wait and run again.
- **rembg**: its default model `bria-rmbg` needs a commercial licence. This project uses `isnet-general-use` instead. Check its licence before commercial use.
- **Free tiers and rate limits** change. Verify current limits before a long run.

---



## Demo

**TODO:** link to the demo video and a sample project folder.


## Licence

MIT
---

## Acknowledgements

- [SerpApi](https://serpapi.com): Google Patents, Trends, Search and Images data
- [Google Gemini](https://ai.google.dev): script, voice and vision
- [Groq](https://groq.com): text generation
- [GSAP](https://gsap.com): the animation timeline