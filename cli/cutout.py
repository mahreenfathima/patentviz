import sys, json
from collections import deque
from PIL import Image, ImageFilter

# usage: cutout.py <in> <out> [--have-alpha]
# Removes a plain background (flood-fill from the border) unless --have-alpha is given
# (rembg already did it), then trims to the subject and prints one JSON line.
src, dst = sys.argv[1], sys.argv[2]
have_alpha = '--have-alpha' in sys.argv

def out(**k):
    print(json.dumps(k)); sys.exit(0)

try:
    im = Image.open(src)
    im.load()
except Exception as e:
    out(ok=False, why='unreadable: %s' % e)

im = im.convert('RGBA')
if max(im.size) > 1400:
    r = 1400 / max(im.size)
    im = im.resize((max(1, int(im.width * r)), max(1, int(im.height * r))), Image.LANCZOS)
w, h = im.size

if not have_alpha:
    px = im.load()
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + \
             [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    # background colour = per-channel median of the border
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    def dist(c):
        return ((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) ** 0.5
    TOL = 38
    near = sum(1 for c in border if dist(c) < TOL) / len(border)
    if near < 0.82:
        out(ok=False, why='background is not plain (%.0f%% uniform border)' % (near * 100))
    seen = bytearray(w * h)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if dist(px[x, y]) < TOL and not seen[y * w + x]:
                seen[y * w + x] = 1; dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if dist(px[x, y]) < TOL and not seen[y * w + x]:
                seen[y * w + x] = 1; dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                c, p = px[nx, ny], px[x, y]
                step = abs(c[0] - p[0]) + abs(c[1] - p[1]) + abs(c[2] - p[2])
                lowsat = max(c[:3]) - min(c[:3]) < 26
                # plain background, OR a smooth grey gradient (a soft shadow) that fades in gently
                if dist(c) < TOL or (step < 14 and lowsat and dist(c) < 150):
                    seen[ny * w + nx] = 1; dq.append((nx, ny))
    removed = sum(seen) / (w * h)
    if removed < 0.05 or removed > 0.92:
        out(ok=False, why='removed %.0f%% of the image, not trustworthy' % (removed * 100))
    mask = Image.frombytes('L', (w, h), bytes(0 if v else 255 for v in seen))
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.1))
    im.putalpha(mask)

a = im.getchannel('A')
transparent = sum(a.histogram()[:16]) / (w * h)
if have_alpha and transparent < 0.04:
    out(ok=False, why='background was not removed')
box = a.point(lambda v: 255 if v > 24 else 0).getbbox()
if not box:
    out(ok=False, why='nothing left after removal')
pad = int(max(w, h) * 0.01)
box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
im = im.crop(box)
im.save(dst)
out(ok=True, w=im.width, h=im.height, transparent=round(transparent, 2))
