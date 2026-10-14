"""
Precision Plaque Border Extraction
Extracts ONLY the antique brass border/carvings from the user's reference image,
leaving the inner text area and exterior completely transparent.
"""

import os
from PIL import Image, ImageFilter, ImageOps, ImageDraw

REF_PATH = r"C:\Users\yeoboya\.gemini\antigravity\brain\20c7cdc5-d640-40f6-b14a-fcd80086b50d\.user_uploaded\media_1791650752781_6cf4415f.png"
OUTPUT_DIR = r"d:\Project\samgukji-rpg\docs\art\ui-sheets\plaque-parts"
GAME_UI_DIR = r"d:\Project\samgukji-rpg\apps\game\public\art\battle\ui\header"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(GAME_UI_DIR, exist_ok=True)

img = Image.open(REF_PATH).convert('RGBA')
w, h = img.size
print(f"Original plaque crop: {w}x{h}")

# 1. Define inner window bounding box where text and green plate reside
# Looking at the image:
# Left carving ends around x=90..95
# Right carving starts around x=215..220
# Top border bar is y: 0..8
# Bottom border bar is y: 44..52
# Let's inspect the exact inner rectangle
inner_x1 = 88
inner_x2 = 222
inner_y1 = 8
inner_y2 = 47

# Create border alpha mask
# Start with empty mask
border_alpha = Image.new('L', (w, h), 0)
border_rgb = Image.new('RGB', (w, h), (0, 0, 0))

r, g, b, _ = img.split()
r_d, g_d, b_d = r.load(), g.load(), b.load()
ba_d = border_alpha.load()
brgb_d = border_rgb.load()

for y in range(h):
    for x in range(w):
        rv, gv, bv = r_d[x, y], g_d[x, y], b_d[x, y]
        
        # 1. Inside the text/color plate window -> MUST BE 100% TRANSPARENT
        # The inner area is slanted/trapezoidal or rectangular
        # Notice the left edge slants from (92, 8) to (84, 46)
        # Right edge slants from (212, 8) to (224, 46)
        slant_left = 92 - (y - 8) * (8 / 38.0)
        slant_right = 210 + (y - 8) * (14 / 38.0)
        
        is_inner_window = (slant_left <= x <= slant_right) and (8 <= y <= 45)
        
        # 2. Outside background (sky below y=46 outside carvings, or top bar above y=6)
        # Sky below has high blue/cyan or light gray: bv > 80 and rv < bv, or rv > 90 and gv > 90 and bv > 90
        is_sky = False
        if y >= 45:
            # Check if this pixel is sky rather than bronze carving
            # Bronze carving is brownish: rv > bv + 10, whereas sky is bluish or bright neutral
            if bv >= rv or (rv > 90 and bv > 80):
                is_sky = True
        if y <= 5 and (x < 15 or x > 280):
            is_sky = True
            
        # Is this pixel bronze carving?
        # Bronze carving characteristics: warm brown/gold/brass tone (rv > bv + 8), not green plate
        is_bronze = (rv > bv + 8) and (rv > 45) and not is_sky
        
        # Top border bar
        if 4 <= y <= 8 and (20 <= x <= 280):
            is_bronze = True
        # Bottom border bar
        if 44 <= y <= 50 and (60 <= x <= 250):
            is_bronze = True

        if is_inner_window:
            ba_d[x, y] = 0
            brgb_d[x, y] = (0, 0, 0)
        elif is_bronze:
            ba_d[x, y] = 255
            brgb_d[x, y] = (rv, gv, bv)
        else:
            ba_d[x, y] = 0
            brgb_d[x, y] = (0, 0, 0)

# Soften mask edges slightly
alpha_smooth = border_alpha.filter(ImageFilter.GaussianBlur(radius=0.8))

# Assemble clean RGBA border
border_rgba = Image.new('RGBA', (w, h))
b_r, b_g, b_b = border_rgb.split()
border_rgba = Image.merge('RGBA', (b_r, b_g, b_b, alpha_smooth))

# Trim empty padding
bbox = border_rgba.getbbox()
if bbox:
    border_trimmed = border_rgba.crop(bbox)
else:
    border_trimmed = border_rgba

print(f"Trimmed border size: {border_trimmed.size}")

# Save left border
border_left_path = os.path.join(OUTPUT_DIR, "plaque_border_left.png")
border_trimmed.save(border_left_path, format='PNG')
border_trimmed.save(os.path.join(GAME_UI_DIR, "plaque_border_left.png"), format='PNG')

# Save right border (horizontally flipped!)
border_right = border_trimmed.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
border_right_path = os.path.join(OUTPUT_DIR, "plaque_border_right.png")
border_right.save(border_right_path, format='PNG')
border_right.save(os.path.join(GAME_UI_DIR, "plaque_border_right.png"), format='PNG')

print("Plaque borders saved successfully!")

