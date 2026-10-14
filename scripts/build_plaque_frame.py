"""
Build Script for Faction Plaque Border Frame & Color Plates
- Extracts transparent RGBA border from high-res asset
- Generates horizontally flipped right frame
- Generates 4 faction color background plates (Green, Blue, Ochre, Red)
- Saves to apps/game/public/art/battle/ui/header and docs/art/ui-sheets/plaque-parts
"""

import os
from PIL import Image, ImageFilter, ImageOps, ImageDraw

GEN_IMAGE = r"C:\Users\yeoboya\.gemini\antigravity\brain\20c7cdc5-d640-40f6-b14a-fcd80086b50d\faction_name_plaque_frame_1791651117554.jpg"
DOCS_DIR = r"d:\Project\samgukji-rpg\docs\art\ui-sheets\plaque-parts"
GAME_DIR = r"d:\Project\samgukji-rpg\apps\game\public\art\battle\ui\header"

os.makedirs(DOCS_DIR, exist_ok=True)
os.makedirs(GAME_DIR, exist_ok=True)

img = Image.open(GEN_IMAGE).convert('RGB')
w, h = img.size
gray = img.convert('L')

# Flood fill outer background
outer_bg = Image.new('L', (w, h), 0)
visited = bytearray(w * h)
queue = []

for x in range(w):
    for y in [0, h - 1]:
        if gray.getpixel((x, y)) <= 15:
            idx = y * w + x
            if not visited[idx]:
                visited[idx] = 1
                queue.append((x, y))
                outer_bg.putpixel((x, y), 255)
for y in range(h):
    for x in [0, w - 1]:
        if gray.getpixel((x, y)) <= 15:
            idx = y * w + x
            if not visited[idx]:
                visited[idx] = 1
                queue.append((x, y))
                outer_bg.putpixel((x, y), 255)

head = 0
while head < len(queue):
    cx, cy = queue[head]
    head += 1
    for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
        if 0 <= nx < w and 0 <= ny < h:
            idx = ny * w + nx
            if not visited[idx]:
                visited[idx] = 1
                if gray.getpixel((nx, ny)) <= 15:
                    outer_bg.putpixel((nx, ny), 255)
                    queue.append((nx, ny))

# Flood fill inner hollow window from center (w//2, h//2)
inner_bg = Image.new('L', (w, h), 0)
center_seed = (w // 2, h // 2)
if gray.getpixel(center_seed) <= 15:
    iqueue = [center_seed]
    ivisit = bytearray(w * h)
    idx = center_seed[1] * w + center_seed[0]
    ivisit[idx] = 1
    inner_bg.putpixel(center_seed, 255)
    
    ihead = 0
    while ihead < len(iqueue):
        cx, cy = iqueue[ihead]
        ihead += 1
        for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
            if 0 <= nx < w and 0 <= ny < h:
                nidx = ny * w + nx
                if not ivisit[nidx]:
                    ivisit[nidx] = 1
                    if gray.getpixel((nx, ny)) <= 15:
                        inner_bg.putpixel((nx, ny), 255)
                        iqueue.append((nx, ny))

# Frame mask is everything that is NEITHER outer_bg NOR inner_bg
frame_mask = Image.new('L', (w, h), 0)
fm_d = frame_mask.load()
ob_d = outer_bg.load()
ib_d = inner_bg.load()
g_d = gray.load()

for y in range(h):
    for x in range(w):
        if ob_d[x, y] == 255 or ib_d[x, y] == 255:
            fm_d[x, y] = 0
        else:
            # Bronze frame pixel
            # Use brightness to smoothly blend edge anti-aliasing
            val = g_d[x, y]
            if val < 20:
                fm_d[x, y] = 0
            elif val < 50:
                fm_d[x, y] = int((val - 20) / 30.0 * 255)
            else:
                fm_d[x, y] = 255

# Gaussian smooth mask slightly
frame_alpha = frame_mask.filter(ImageFilter.GaussianBlur(radius=1.0))

# Defringe and construct RGBA
r, g, b = img.split()
r_d, g_d, b_d = r.load(), g.load(), b.load()
fa_d = frame_alpha.load()

out_r = Image.new('L', (w, h))
out_g = Image.new('L', (w, h))
out_b = Image.new('L', (w, h))
ord_, ogd_, obd_ = out_r.load(), out_g.load(), out_b.load()

for y in range(h):
    for x in range(w):
        a = fa_d[x, y]
        if a == 0:
            ord_[x, y] = 0
            ogd_[x, y] = 0
            obd_[x, y] = 0
        elif a < 230:
            boost = 255.0 / max(a, 35)
            boost = min(boost, 2.2)
            ord_[x, y] = min(255, int(r_d[x, y] * boost))
            ogd_[x, y] = min(255, int(g_d[x, y] * boost))
            obd_[x, y] = min(255, int(b_d[x, y] * boost))
        else:
            ord_[x, y] = r_d[x, y]
            ogd_[x, y] = g_d[x, y]
            obd_[x, y] = b_d[x, y]

frame_rgba = Image.merge('RGBA', (out_r, out_g, out_b, frame_alpha))

# Trim empty outer padding
bbox = frame_rgba.getbbox()
frame_trimmed = frame_rgba.crop(bbox)

# Create game standard size (e.g. 520x170 for high DPI or 360x118)
target_w = 480
scale = target_w / frame_trimmed.width
target_h = int(frame_trimmed.height * scale)
border_left = frame_trimmed.resize((target_w, target_h), Image.Resampling.LANCZOS)
border_right = border_left.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

def save_dual(im, name):
    im.save(os.path.join(DOCS_DIR, name), format='PNG')
    im.save(os.path.join(GAME_DIR, name), format='PNG')
    print(f"Saved: {name} ({im.size})")

save_dual(border_left, "plaque_frame_border_left.png")
save_dual(border_right, "plaque_frame_border_right.png")

# Now generate Inner Color Plates (Green, Blue, Ochre, Red)
# Inner plate fits nicely behind the frame
plate_w, plate_h = target_w, target_h

# Color definitions (center gradient from rich dark to elegant tone)
colors = {
    "green": ((12, 38, 28), (22, 64, 46)),    # 촉군 비취 녹색 (Shu Jade Green)
    "blue":  ((16, 28, 48), (28, 52, 92)),    # 위군 군청 파랑 (Wei Royal Blue)
    "ochre": ((48, 36, 16), (92, 68, 28)),    # 황건군 황토 (Yellow Turban Ochre)
    "red":   ((48, 16, 20), (96, 28, 36)),    # 오군 주홍 (Wu Crimson Red)
}

for cname, (c_dark, c_light) in colors.items():
    plate = Image.new('RGBA', (plate_w, plate_h), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(plate)
    # Draw horizontal gradient inside plate area
    # In target size, inner window is roughly x: 70..410, y: 22..target_h - 22
    for px in range(plate_w):
        factor = 1.0 - abs(px - plate_w / 2) / (plate_w / 2)
        r_val = int(c_dark[0] + (c_light[0] - c_dark[0]) * factor)
        g_val = int(c_dark[1] + (c_light[1] - c_dark[1]) * factor)
        b_val = int(c_dark[2] + (c_light[2] - c_dark[2]) * factor)
        pdraw.line([(px, 0), (px, plate_h)], fill=(r_val, g_val, b_val, 255))
    
    save_dual(plate, f"plate_color_{cname}.png")

print("\n--- Plaque Frame & Color Plates Generation Completed! ---")

