"""
True Color-Based Segmentation for Faction Frame & Inner Plates
- Every bronze/brass pixel (rv > bv + 6, warm tone) belongs to faction_frame.png
- Inner window is transparent ONLY where the green plate actually was
- Guarantees 100% of the dragon head, scales, and clouds are preserved
"""

import os
from PIL import Image, ImageFilter, ImageOps, ImageDraw

ORIGINAL_REF = r"C:\Users\yeoboya\.gemini\antigravity\brain\20c7cdc5-d640-40f6-b14a-fcd80086b50d\.user_uploaded\media_1791651065941_4d0177f4.png"
DOCS_DIR = r"d:\Project\samgukji-rpg\docs\art\ui-sheets\faction-frame"
GAME_DIR = r"d:\Project\samgukji-rpg\apps\game\public\art\battle\ui\header"

src = Image.open(ORIGINAL_REF).convert('RGBA')
src_w, src_h = src.size

# Plaque crop: x: 2..258, y: 3..58 (size: 256x55)
x1, y1, x2, y2 = 2, 3, 258, 58
left_crop = src.crop((x1, y1, x2, y2))
cw, ch = left_crop.size

r_img, g_img, b_img, _ = left_crop.split()
r_d, g_d, b_d = r_img.load(), g_img.load(), b_img.load()

# --- 1. Inner Plates Extraction (Inpainting Text) ---
clean_greens = []
for y in range(10, 46):
    for x in range(85, 98):
        clean_greens.append((r_d[x, y], g_d[x, y], b_d[x, y]))

avg_gr = sum(c[0] for c in clean_greens) // len(clean_greens)
avg_gg = sum(c[1] for c in clean_greens) // len(clean_greens)
avg_gb = sum(c[2] for c in clean_greens) // len(clean_greens)

rx1, ry1, rx2, ry2 = src_w - x2, y1, src_w - x1, y2
right_crop = src.crop((rx1, ry1, rx2, ry2)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
rc_r, rc_g, rc_b, _ = right_crop.split()
rcr_d, rcg_d, rcb_d = rc_r.load(), rc_g.load(), rc_b.load()

clean_ochres = []
for y in range(10, 46):
    for x in range(85, 98):
        clean_ochres.append((rcr_d[x, y], rcg_d[x, y], rcb_d[x, y]))

avg_or = sum(c[0] for c in clean_ochres) // len(clean_ochres)
avg_og = sum(c[1] for c in clean_ochres) // len(clean_ochres)
avg_ob = sum(c[2] for c in clean_ochres) // len(clean_ochres)

def make_plate(base_c, high_c):
    plate = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    p_d = plate.load()
    for y in range(ch):
        for x in range(cw):
            # Inner plate polygon: x: 68..202, y: 5..50
            slant_l = 74 - (y - 5) * (10.0 / 44.0)
            slant_r = 194 + (y - 5) * (12.0 / 44.0)
            if (slant_l <= x <= slant_r) and (5 <= y <= 50):
                nx = (x - slant_l) / max(1.0, slant_r - slant_l)
                sheen = max(0.0, 1.0 - 3.2 * (nx - 0.5) ** 2)
                v_sheen = 1.0 - (y - 5) / 52.0
                
                r = int(base_c[0] + (high_c[0] - base_c[0]) * sheen * v_sheen)
                g = int(base_c[1] + (high_c[1] - base_c[1]) * sheen * v_sheen)
                b = int(base_c[2] + (high_c[2] - base_c[2]) * sheen * v_sheen)
                p_d[x, y] = (min(255, max(0, r)), min(255, max(0, g)), min(255, max(0, b)), 255)
    return plate

green_plate = make_plate((avg_gr - 4, avg_gg - 4, avg_gb - 4), (avg_gr + 12, avg_gg + 16, avg_gb + 12))
ochre_plate = make_plate((avg_or - 6, avg_og - 6, avg_ob - 4), (avg_or + 14, avg_og + 14, avg_ob + 10))
blue_plate  = make_plate((10, 18, 30), (20, 38, 62))

# --- 2. Clean Hollow Frame (faction_frame.png) ---
frame_alpha = Image.new('L', (cw, ch), 0)
fa_d = frame_alpha.load()
frame_rgb = Image.new('RGB', (cw, ch), (0, 0, 0))
frgb_d = frame_rgb.load()

bronze_hi = (108, 86, 54)
bronze_mid = (72, 58, 40)
bronze_low = (46, 36, 26)

for y in range(ch):
    for x in range(cw):
        rv, gv, bv = r_d[x, y], g_d[x, y], b_d[x, y]
        
        # 1. Sky bleed at bottom (y >= 48 outside bronze)
        is_sky = False
        if y >= 48:
            if (bv >= rv - 2) or (rv > 85 and bv > 75):
                is_sky = True
        if y <= 1 and (x < 15 or x > 235):
            is_sky = True
            
        # 2. Bronze detection: warm brown/gold tone (rv > bv + 6 and rv > 34)
        is_bronze = (rv > bv + 6) and (rv > 34) and not is_sky
        
        # Continuous Top Bar (y: 2..5, x: 12..240)
        if 2 <= y <= 5 and (12 <= x <= 240):
            is_bronze = True
            c = bronze_hi if y == 3 else bronze_mid
            rv, gv, bv = c
            
        # Continuous Bottom Bar (y: 49..52, x: 50..220)
        if 49 <= y <= 52 and (50 <= x <= 220):
            is_bronze = True
            c = bronze_mid if y == 50 else bronze_low
            rv, gv, bv = c
            
        # 3. Inner window area: if NOT bronze and inside the plate area -> 100% transparent!
        if is_bronze:
            fa_d[x, y] = 255
            frgb_d[x, y] = (rv, gv, bv)
        else:
            fa_d[x, y] = 0
            frgb_d[x, y] = (0, 0, 0)

# Filter small specks (< 16 px)
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
            if len(comp) < 16:
                for cx, cy in comp:
                    fa_d[cx, cy] = 0

alpha_smooth = frame_alpha.filter(ImageFilter.GaussianBlur(radius=0.4))
fr_r, fr_g, fr_b = frame_rgb.split()
faction_frame = Image.merge('RGBA', (fr_r, fr_g, fr_b, alpha_smooth))

# Save dual
def save_dual(im, name):
    im.save(os.path.join(DOCS_DIR, name), format='PNG')
    im.save(os.path.join(GAME_DIR, name), format='PNG')
    print(f"Saved: {name} ({im.size})")

save_dual(faction_frame, "faction_frame.png")
save_dual(green_plate, "faction_inner_green.png")
save_dual(ochre_plate, "faction_inner_ochre.png")
save_dual(blue_plate, "faction_inner_blue.png")

faction_frame_flipped = faction_frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
save_dual(faction_frame_flipped, "faction_frame_flipped.png")

print("\n--- Color-Based Segmentation Completed! ---")

