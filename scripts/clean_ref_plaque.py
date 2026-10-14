"""
Advanced clean-up and reconstruction of the reference plaque border.
- Removes isolated noise specks via connected component analysis
- Removes sky/blue bleed
- Connects continuous top and bottom bronze bevel bars
- Completely clears the inner window
"""

import os
from PIL import Image, ImageFilter, ImageOps, ImageDraw

REF_PATH = r"C:\Users\yeoboya\.gemini\antigravity\brain\20c7cdc5-d640-40f6-b14a-fcd80086b50d\.user_uploaded\media_1791650752781_6cf4415f.png"
OUTPUT_DIR = r"d:\Project\samgukji-rpg\docs\art\ui-sheets\plaque-parts"
GAME_UI_DIR = r"d:\Project\samgukji-rpg\apps\game\public\art\battle\ui\header"

img = Image.open(REF_PATH).convert('RGBA')
w, h = img.size

# Let's scale up 2x with high quality to get smooth sub-pixel curves
w2, h2 = w * 2, h * 2
img2 = img.resize((w2, h2), Image.Resampling.LANCZOS)
r, g, b, _ = img2.split()
r_d, g_d, b_d = r.load(), g.load(), b.load()

# Create clean mask
mask = Image.new('L', (w2, h2), 0)
m_d = mask.load()

for y in range(h2):
    for x in range(w2):
        rv, gv, bv = r_d[x, y], g_d[x, y], b_d[x, y]
        
        # Calculate trapezoidal inner window
        # In 2x scale: left boundary goes from (180, 16) to (168, 92)
        # right boundary goes from (424, 16) to (448, 92)
        slant_left = 180 - (y - 16) * (12 / 76.0)
        slant_right = 420 + (y - 16) * (28 / 76.0)
        
        is_inner = (slant_left <= x <= slant_right) and (16 <= y <= 92)
        
        if is_inner:
            continue
            
        # Filter out sky (sky has blue/cyan or light neutral tint)
        is_sky = False
        if y >= 90:
            if bv >= rv or (bv > 70 and rv < 100):
                is_sky = True
        if y <= 10 and (x < 30 or x > 560):
            is_sky = True
            
        # Bronze tone detection
        is_bronze = (rv > bv + 10) and (rv > 48) and (gv > 38) and not is_sky
        
        # Keep solid top bar
        if 8 <= y <= 16 and (30 <= x <= 560):
            is_bronze = True
            
        # Keep solid bottom bar
        if 88 <= y <= 98 and (100 <= x <= 500):
            is_bronze = True
            
        if is_bronze:
            m_d[x, y] = 255

# Connected component filter to remove stray dots (< 40 connected pixels)
visited = bytearray(w2 * h2)
comps = []
for y in range(h2):
    for x in range(w2):
        idx = y * w2 + x
        if m_d[x, y] > 0 and not visited[idx]:
            comp = []
            queue = [(x, y)]
            visited[idx] = 1
            comp.append((x, y))
            head = 0
            while head < len(queue):
                cx, cy = queue[head]
                head += 1
                for nx, ny in [(cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)]:
                    if 0 <= nx < w2 and 0 <= ny < h2:
                        nidx = ny * w2 + nx
                        if not visited[nidx] and m_d[nx, ny] > 0:
                            visited[nidx] = 1
                            queue.append((nx, ny))
                            comp.append((nx, ny))
            comps.append(comp)

# Erase components smaller than 45 pixels
for comp in comps:
    if len(comp) < 45:
        for x, y in comp:
            m_d[x, y] = 0

# Smooth the mask
mask_smooth = mask.filter(ImageFilter.GaussianBlur(radius=1.2))

# Now construct the output RGBA
out_rgba = Image.new('RGBA', (w2, h2))
r_clean, g_clean, b_clean = img2.split()
out_rgba = Image.merge('RGBA', (r_clean, g_clean, b_clean, mask_smooth))

# Trim empty margins
tb = out_rgba.getbbox()
if tb:
    final_left = out_rgba.crop(tb)
else:
    final_left = out_rgba

# Save left frame
final_left.save(os.path.join(OUTPUT_DIR, "plaque_border_ref_left.png"), format='PNG')
final_left.save(os.path.join(GAME_UI_DIR, "plaque_border_ref_left.png"), format='PNG')

# Save right frame (horizontal flip)
final_right = final_left.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
final_right.save(os.path.join(OUTPUT_DIR, "plaque_border_ref_right.png"), format='PNG')
final_right.save(os.path.join(GAME_UI_DIR, "plaque_border_ref_right.png"), format='PNG')

print(f"Refined reference frame saved: {final_left.size}")

