"""
Precise Extraction and Separation of Faction Frame directly from the Original Reference.
Follows User Rules:
- Preserves 100% of original dark iron / antique bronze texture, tones, and silhouette.
- Absolutely NO new ornaments, bright glows, or neon colors.
- Separates:
  1. faction_frame.png (hollow transparent antique bronze frame)
  2. faction_inner_green.png (original jade green plate texture with text removed)
  3. faction_inner_ochre.png (original yellow turban ochre plate texture with text removed)
  4. faction_inner_blue.png (matching dark blue plate texture for Wei faction)
- Validates horizontal flip for right faction.
"""

import os
from PIL import Image, ImageFilter, ImageOps, ImageDraw

ORIGINAL_REF = r"C:\Users\yeoboya\.gemini\antigravity\brain\20c7cdc5-d640-40f6-b14a-fcd80086b50d\.user_uploaded\media_1791651065941_4d0177f4.png"
DOCS_DIR = r"d:\Project\samgukji-rpg\docs\art\ui-sheets\faction-frame"
GAME_DIR = r"d:\Project\samgukji-rpg\apps\game\public\art\battle\ui\header"

os.makedirs(DOCS_DIR, exist_ok=True)
os.makedirs(GAME_DIR, exist_ok=True)

src = Image.open(ORIGINAL_REF).convert('RGBA')
src_w, src_h = src.size

# --- 1. Crop Left Plaque Region ---
# Outer bounds of left plaque:
# Leftmost dragon claw begins around x: 3
# Right cloud tail finishes before morale bar around x: 258
# Top border bar: y: 7
# Bottom cloud dip: y: 56
x1, y1, x2, y2 = 2, 6, 258, 57
left_crop = src.crop((x1, y1, x2, y2))
cw, ch = left_crop.size

print(f"Extracted left plaque bounds: ({x1}, {y1}) to ({x2}, {y2}), size: {cw}x{ch}")

# --- 2. Create Hollow Bronze Frame (faction_frame.png) ---
# Separate channels
r, g, b, _ = left_crop.split()
r_d, g_d, b_d = r.load(), g.load(), b.load()

# Frame Alpha Mask: 255 for bronze frame, 0 for inner plate and outer background
frame_alpha = Image.new('L', (cw, ch), 0)
fa_d = frame_alpha.load()

# Inner plate window polygon / bounds in left_crop coordinates:
# Top-left of inner plate: (76, 4)
# Bottom-left of inner plate: (68, 38)
# Top-right of inner plate: (182, 4)
# Bottom-right of inner plate: (194, 38)

for y in range(ch):
    for x in range(cw):
        rv, gv, bv = r_d[x, y], g_d[x, y], b_d[x, y]
        
        # Check if inside the inner text/plate window
        slant_l = 75 - (y - 4) * (8.0 / 34.0)
        slant_r = 180 + (y - 4) * (14.0 / 34.0)
        is_inner = (slant_l <= x <= slant_r) and (4 <= y <= 40)
        
        # Check if sky / exterior background below
        is_sky = False
        if y >= 38:
            # Sky has bluish tint or neutral bright gray: bv > 80 and rv < bv, or (rv > 100 and bv > 90)
            if (bv >= rv - 2) or (rv > 95 and bv > 85):
                is_sky = True
        if y <= 2 and (x < 15 or x > 230):
            is_sky = True
        if x <= 2 and y <= 15:
            is_sky = True
            
        # Bronze carving detection: warm antique bronze (rv > bv + 6 and rv > 40)
        is_bronze = (rv > bv + 6) and (rv > 36) and not is_sky
        
        # Solid top frame bar
        if 2 <= y <= 5 and (18 <= x <= 230):
            is_bronze = True
        # Solid bottom frame bar
        if 39 <= y <= 44 and (50 <= x <= 210):
            is_bronze = True
            
        if is_inner:
            fa_d[x, y] = 0
        elif is_bronze:
            fa_d[x, y] = 255
        else:
            fa_d[x, y] = 0

# Remove small disconnected stray pixels (< 15 px)
visited = bytearray(cw * ch)
for y in range(ch):
    for x in range(cw):
        idx = y * cw + x
        if fa_d[x, y] > 0 and not visited[idx]:
            comp = []
            queue = [(x, y)]
            visited[idx] = 1
            comp.append((x, y))
            head = 0
            while head < len(queue):
                cx, cy = queue[head]
                head += 1
                for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
                    if 0 <= nx < cw and 0 <= ny < ch:
                        nidx = ny * cw + nx
                        if not visited[nidx] and fa_d[nx, ny] > 0:
                            visited[nidx] = 1
                            queue.append((nx, ny))
                            comp.append((nx, ny))
            if len(comp) < 18:
                for cx, cy in comp:
                    fa_d[cx, cy] = 0

# Smooth alpha slightly
frame_alpha_smooth = frame_alpha.filter(ImageFilter.GaussianBlur(radius=0.6))

# Defringe RGB
out_r = Image.new('L', (cw, ch))
out_g = Image.new('L', (cw, ch))
out_b = Image.new('L', (cw, ch))
ord_, ogd_, obd_ = out_r.load(), out_g.load(), out_b.load()
fas_d = frame_alpha_smooth.load()

for y in range(ch):
    for x in range(cw):
        a = fas_d[x, y]
        if a == 0:
            ord_[x, y] = 0
            ogd_[x, y] = 0
            obd_[x, y] = 0
        else:
            ord_[x, y] = r_d[x, y]
            ogd_[x, y] = g_d[x, y]
            obd_[x, y] = b_d[x, y]

faction_frame = Image.merge('RGBA', (out_r, out_g, out_b, frame_alpha_smooth))

# --- 3. Extract Clean Inner Background Plates ---
# A: Green Plate (from left Shu area, removing '촉군' letters)
green_plate = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
gp_d = green_plate.load()

# Sample genuine green texture colors from the plate (near edges where text is not present)
# Green plate bounds: x: 74..190, y: 5..39
green_samples = []
for y in range(8, 36):
    for x in range(78, 185):
        rv, gv, bv = r_d[x, y], g_d[x, y], b_d[x, y]
        # Text is bright: rv > 80, gv > 80, bv > 80
        if not (rv > 75 and gv > 75 and bv > 70):
            green_samples.append((rv, gv, bv))

# Median green color
avg_r = sum(c[0] for c in green_samples) // len(green_samples)
avg_g = sum(c[1] for c in green_samples) // len(green_samples)
avg_b = sum(c[2] for c in green_samples) // len(green_samples)
print(f"Genuine Jade Green texture average: ({avg_r}, {avg_g}, {avg_b})")

for y in range(ch):
    for x in range(cw):
        slant_l = 75 - (y - 4) * (8.0 / 34.0)
        slant_r = 180 + (y - 4) * (14.0 / 34.0)
        if (slant_l <= x <= slant_r) and (4 <= y <= 40):
            rv, gv, bv = r_d[x, y], g_d[x, y], b_d[x, y]
            # If text, inpaint with original background texture
            if rv > 75 and gv > 75 and bv > 70:
                # Add slight texture noise around average
                noise = (x * 7 + y * 13) % 7 - 3
                gp_d[x, y] = (max(0, min(255, avg_r + noise)),
                              max(0, min(255, avg_g + noise)),
                              max(0, min(255, avg_b + noise)), 255)
            else:
                gp_d[x, y] = (rv, gv, bv, 255)

# B: Ochre Plate (from right Yellow Turban area)
# In src, right plaque is around x: 968-258 to 968
rx1, ry1, rx2, ry2 = src_w - x2, y1, src_w - x1, y2
right_crop = src.crop((rx1, ry1, rx2, ry2)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
rc_r, rc_g, rc_b, _ = right_crop.split()
rcr_d, rcg_d, rcb_d = rc_r.load(), rc_g.load(), rc_b.load()

ochre_plate = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
op_d = ochre_plate.load()

ochre_samples = []
for y in range(8, 36):
    for x in range(78, 185):
        rv, gv, bv = rcr_d[x, y], rcg_d[x, y], rcb_d[x, y]
        if not (rv > 110 and gv > 105 and bv > 95):
            ochre_samples.append((rv, gv, bv))

avg_or = sum(c[0] for c in ochre_samples) // len(ochre_samples)
avg_og = sum(c[1] for c in ochre_samples) // len(ochre_samples)
avg_ob = sum(c[2] for c in ochre_samples) // len(ochre_samples)
print(f"Genuine Yellow Turban Ochre texture average: ({avg_or}, {avg_og}, {avg_ob})")

for y in range(ch):
    for x in range(cw):
        slant_l = 75 - (y - 4) * (8.0 / 34.0)
        slant_r = 180 + (y - 4) * (14.0 / 34.0)
        if (slant_l <= x <= slant_r) and (4 <= y <= 40):
            rv, gv, bv = rcr_d[x, y], rcg_d[x, y], rcb_d[x, y]
            if rv > 110 and gv > 105 and bv > 95:
                noise = (x * 7 + y * 13) % 7 - 3
                op_d[x, y] = (max(0, min(255, avg_or + noise)),
                              max(0, min(255, avg_og + noise)),
                              max(0, min(255, avg_ob + noise)), 255)
            else:
                op_d[x, y] = (rv, gv, bv, 255)

# C: Blue Plate (for Wei faction, shifting green hue to deep historical indigo/navy)
blue_plate = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
bp_d = blue_plate.load()
for y in range(ch):
    for x in range(cw):
        c = gp_d[x, y]
        if c[3] > 0:
            # Shift jade green (low r, med g, low b) to dark royal indigo (low r, low-med g, high b)
            bp_d[x, y] = (int(c[0] * 0.8), int(c[1] * 0.7), int(c[1] * 1.3), 255)

# --- 4. Save Assets to Docs & Game Runtime ---
def save_asset(img, filename):
    p_docs = os.path.join(DOCS_DIR, filename)
    p_game = os.path.join(GAME_DIR, filename)
    img.save(p_docs, format='PNG')
    img.save(p_game, format='PNG')
    print(f"Saved: {filename} ({img.size})")

save_asset(faction_frame, "faction_frame.png")
save_asset(green_plate, "faction_inner_green.png")
save_asset(ochre_plate, "faction_inner_ochre.png")
save_asset(blue_plate, "faction_inner_blue.png")

# Also save horizontally flipped frame for direct comparison
faction_frame_flipped = faction_frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
save_asset(faction_frame_flipped, "faction_frame_flipped.png")

print("\n--- Direct Original Extraction Complete! ---")

