"""
Full Asset Build Pipeline for Top Section UI & Battlefield
Outputs clean RGBA assets to both apps/game/public/art/battle/ and docs/art/ui-sheets/top-section/
"""

import os
from PIL import Image, ImageFilter, ImageOps, ImageDraw

UI_SHEET_PATH = r"C:\Users\yeoboya\.gemini\antigravity\brain\20c7cdc5-d640-40f6-b14a-fcd80086b50d\three_kingdoms_tactical_ui_spritesheet_black_bg_1791648252197.jpg"
BG_IMAGE_PATH = r"C:\Users\yeoboya\.gemini\antigravity\brain\20c7cdc5-d640-40f6-b14a-fcd80086b50d\battle_background_plains_1791648233172.jpg"

GAME_PUB_HEADER = r"d:\Project\samgukji-rpg\apps\game\public\art\battle\ui\header"
GAME_PUB_BATTLE = r"d:\Project\samgukji-rpg\apps\game\public\art\battle"
DOCS_TOP_DIR = r"d:\Project\samgukji-rpg\docs\art\ui-sheets\top-section"

os.makedirs(GAME_PUB_HEADER, exist_ok=True)
os.makedirs(DOCS_TOP_DIR, exist_ok=True)

def flood_fill_mask(img_rgb, threshold=18):
    w, h = img_rgb.size
    gray = img_rgb.convert('L')
    mask = Image.new('L', (w, h), 0)
    visited = bytearray(w * h)
    queue = []
    
    # Border seed
    for x in range(w):
        for y in [0, h - 1]:
            if gray.getpixel((x, y)) <= threshold:
                idx = y * w + x
                if not visited[idx]:
                    visited[idx] = 1
                    queue.append((x, y))
                    mask.putpixel((x, y), 255)
    for y in range(h):
        for x in [0, w - 1]:
            if gray.getpixel((x, y)) <= threshold:
                idx = y * w + x
                if not visited[idx]:
                    visited[idx] = 1
                    queue.append((x, y))
                    mask.putpixel((x, y), 255)
                    
    head = 0
    while head < len(queue):
        cx, cy = queue[head]
        head += 1
        for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx]:
                    visited[idx] = 1
                    if gray.getpixel((nx, ny)) <= threshold:
                        mask.putpixel((nx, ny), 255)
                        queue.append((nx, ny))
                        
    return ImageOps.invert(mask)

def extract_clean_rgba(crop_rgb, threshold=18, feather=1.2):
    w, h = crop_rgb.size
    alpha_raw = flood_fill_mask(crop_rgb, threshold=threshold)
    alpha_smooth = alpha_raw.filter(ImageFilter.GaussianBlur(radius=feather))
    
    r, g, b = crop_rgb.split()
    r_data = r.load()
    g_data = g.load()
    b_data = b.load()
    a_data = alpha_smooth.load()
    
    out_r = Image.new('L', (w, h))
    out_g = Image.new('L', (w, h))
    out_b = Image.new('L', (w, h))
    ord_ = out_r.load()
    ogd_ = out_g.load()
    obd_ = out_b.load()
    
    for y in range(h):
        for x in range(w):
            a = a_data[x, y]
            if a == 0:
                ord_[x, y] = 0
                ogd_[x, y] = 0
                obd_[x, y] = 0
            elif a < 235:
                boost = 255.0 / max(a, 35)
                boost = min(boost, 2.2)
                ord_[x, y] = min(255, int(r_data[x, y] * boost))
                ogd_[x, y] = min(255, int(g_data[x, y] * boost))
                obd_[x, y] = min(255, int(b_data[x, y] * boost))
            else:
                ord_[x, y] = r_data[x, y]
                ogd_[x, y] = g_data[x, y]
                obd_[x, y] = b_data[x, y]
                
    return Image.merge('RGBA', (out_r, out_g, out_b, alpha_smooth))

def save_both(img, filename):
    p1 = os.path.join(GAME_PUB_HEADER, filename)
    p2 = os.path.join(DOCS_TOP_DIR, filename)
    img.save(p1, format='PNG')
    img.save(p2, format='PNG')
    print(f"Saved: {filename} ({img.size})")

sheet = Image.open(UI_SHEET_PATH).convert('RGB')

# 1. Header Bar (225, 28, 1151, 174)
bar_crop = sheet.crop((225, 28, 1151, 174))
header_bar_rgba = extract_clean_rgba(bar_crop, threshold=16)
save_both(header_bar_rgba, "header_bg_bar.png")

# Also create a stretched/fitted 1280x64 header bar for 1:1 runtime match
fitted_header_1280 = header_bar_rgba.resize((1280, 68), Image.Resampling.LANCZOS)
save_both(fitted_header_1280, "header_bg_bar_1280.png")

# 2. Shu Han Dragon Plaque (12, 200, 461, 580)
shu_crop = sheet.crop((12, 200, 461, 580))
shu_rgba = extract_clean_rgba(shu_crop, threshold=16)
save_both(shu_rgba, "plaque_faction_shu.png")

# 3. Yellow Turban Tiger Plaque (920, 200, 1364, 580)
yt_crop = sheet.crop((920, 200, 1364, 580))
yt_rgba = extract_clean_rgba(yt_crop, threshold=16)
save_both(yt_rgba, "plaque_faction_yellow.png")

# 4. Ornate Twin-Dragon Round Plaque (494, 200, 882, 580)
round_crop = sheet.crop((494, 200, 882, 580))
round_rgba = extract_clean_rgba(round_crop, threshold=16)
save_both(round_rgba, "plaque_round_dragons_ornate.png")

# 5. Morale Tug-of-War Gauge Bar (225, 611, 1150, 739)
morale_crop = sheet.crop((225, 611, 1150, 739))
morale_rgba = extract_clean_rgba(morale_crop, threshold=16)
save_both(morale_rgba, "gauge_morale_tug_bar.png")

# 5-A: Extract triangular pointer ▼ from the center of morale bar
# The pointer sits at the center of the morale crop
mc_w, mc_h = morale_rgba.size
center_x = mc_w // 2
pointer_crop = morale_rgba.crop((center_x - 38, 0, center_x + 38, mc_h))
# Trim transparency around pointer
bbox = pointer_crop.getbbox()
if bbox:
    pointer_clean = pointer_crop.crop(bbox)
    save_both(pointer_clean, "pointer_morale_indicator.png")

# 6. Corner Brackets (TL, TR, BL, BR)
corners = [
    ((11, 10, 216, 180), "decor_header_bracket_l.png"),
    ((1160, 10, 1365, 180), "decor_header_bracket_r.png"),
    ((12, 610, 214, 759), "decor_corner_bl.png"),
    ((1162, 610, 1365, 759), "decor_corner_br.png"),
]
for box, name in corners:
    c_crop = sheet.crop(box)
    c_rgba = extract_clean_rgba(c_crop, threshold=16)
    # Trim empty padding
    tb = c_rgba.getbbox()
    if tb:
        c_rgba = c_rgba.crop(tb)
    save_both(c_rgba, name)

# 7. Battlefield Background (1376x768 -> 1280x425 widescreen game canvas)
bg_raw = Image.open(BG_IMAGE_PATH).convert('RGB')
bw, bh = bg_raw.size
# Crop to 1280:425 aspect ratio (3.01:1) from central-lower vantage
target_w = bw
target_h = int(bw * (425 / 1280))
if target_h > bh:
    target_h = bh
    target_w = int(bh * (1280 / 425))

top_y = (bh - target_h) // 2 + 30  # shift slightly downward to include ground
bg_cropped = bg_raw.crop((0, max(0, top_y), bw, min(bh, top_y + target_h)))
bg_1280 = bg_cropped.resize((1280, 425), Image.Resampling.LANCZOS)
bg_1920 = bg_cropped.resize((1920, 638), Image.Resampling.LANCZOS)

# Save battlefield to apps/game/public/art/battle
bg_1280.save(os.path.join(GAME_PUB_BATTLE, "battlefield_camp_bg.png"), format='PNG', quality=95)
bg_1280.save(os.path.join(GAME_PUB_BATTLE, "plain-v1.png"), format='PNG', quality=95)
bg_1280.save(os.path.join(DOCS_TOP_DIR, "battlefield_camp_bg.png"), format='PNG', quality=95)
print("Saved battlefield backgrounds: 1280x425")

print("\n--- All Top Section Assets Successfully Extracted & Processed! ---")

