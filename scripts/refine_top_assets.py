"""
Precision refinement for top-section UI assets:
- Removes accidental bracket corner fringes on Shu / Yellow plaques
- Generates blank base plaques for dynamic in-game text rendering
- Precision crops the gold triangular morale pointer (▼)
- Generates transparent empty morale track channel
"""

import os
from PIL import Image, ImageFilter, ImageOps

UI_SHEET_PATH = r"C:\Users\yeoboya\.gemini\antigravity\brain\20c7cdc5-d640-40f6-b14a-fcd80086b50d\three_kingdoms_tactical_ui_spritesheet_black_bg_1791648252197.jpg"
GAME_PUB_HEADER = r"d:\Project\samgukji-rpg\apps\game\public\art\battle\ui\header"
DOCS_TOP_DIR = r"d:\Project\samgukji-rpg\docs\art\ui-sheets\top-section"

sheet = Image.open(UI_SHEET_PATH).convert('RGB')

def flood_fill_mask(img_rgb, threshold=18):
    w, h = img_rgb.size
    gray = img_rgb.convert('L')
    mask = Image.new('L', (w, h), 0)
    visited = bytearray(w * h)
    queue = []
    
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
    print(f"Refined: {filename} ({img.size})")

# 1. Refined Shu Han Plaque (Avoid left corner brackets & bottom bracket: y cut at 480)
shu_crop = sheet.crop((24, 210, 461, 475))
shu_rgba = extract_clean_rgba(shu_crop, threshold=16)
bbox = shu_rgba.getbbox()
if bbox:
    shu_rgba = shu_rgba.crop(bbox)
save_both(shu_rgba, "plaque_faction_shu.png")

# 2. Refined Yellow Turban Plaque
yt_crop = sheet.crop((920, 210, 1335, 475))
yt_rgba = extract_clean_rgba(yt_crop, threshold=16)
bbox = yt_rgba.getbbox()
if bbox:
    yt_rgba = yt_rgba.crop(bbox)
save_both(yt_rgba, "plaque_faction_yellow.png")

# 3. Precision Pointer ▼ from Morale Bar
# Golden triangle pointer: sheet x: 670..706, y: 622..680
pointer_crop = sheet.crop((664, 620, 712, 684))
pointer_rgba = extract_clean_rgba(pointer_crop, threshold=16)
p_bbox = pointer_rgba.getbbox()
if p_bbox:
    pointer_rgba = pointer_rgba.crop(p_bbox)
save_both(pointer_rgba, "pointer_morale_indicator.png")

print("Refinement completed successfully!")
