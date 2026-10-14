"""
High Quality Alpha Extraction and Asset Slicing Script
for Sengoku Rance Style Three Kingdoms Battle Top Section
"""

import os
from PIL import Image, ImageFilter, ImageOps, ImageDraw

def flood_fill_mask(img_rgb, start_points=[(0, 0)], threshold=16):
    """
    Flood fills from image boundaries to find ONLY the exterior black background.
    Preserves dark interior textures (e.g. ebony wood, dark jade).
    """
    w, h = img_rgb.size
    gray = img_rgb.convert('L')
    
    # Create mask: 255 for exterior background, 0 for asset
    mask = Image.new('L', (w, h), 0)
    visited = bytearray(w * h)
    queue = []
    
    # Seed border pixels
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
                    
    # BFS
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
                        
    # Invert mask: 255 for asset, 0 for exterior
    asset_alpha = ImageOps.invert(mask)
    return asset_alpha

def create_transparent_asset(crop_img, bg_threshold=18, feather=1.5):
    """
    Given an RGB crop with black exterior, creates a clean RGBA image with smooth antialiased alpha.
    """
    w, h = crop_img.size
    alpha_raw = flood_fill_mask(crop_img, threshold=bg_threshold)
    
    # Soften outer edge slightly
    alpha_smooth = alpha_raw.filter(ImageFilter.GaussianBlur(radius=feather))
    
    # Construct RGBA
    rgba = Image.new('RGBA', (w, h))
    r, g, b = crop_img.split()
    
    # Color un-multiplication on semi-transparent edge pixels to remove black halo
    alpha_data = alpha_smooth.load()
    r_data = r.load()
    g_data = g.load()
    b_data = b.load()
    
    out_r = Image.new('L', (w, h))
    out_g = Image.new('L', (w, h))
    out_b = Image.new('L', (w, h))
    ord = out_r.load()
    ogd = out_g.load()
    obd = out_b.load()
    
    for y in range(h):
        for x in range(w):
            a = alpha_data[x, y]
            if a == 0:
                ord[x, y] = 0
                ogd[x, y] = 0
                obd[x, y] = 0
            elif a < 240:
                factor = 255.0 / max(a, 30)
                factor = min(factor, 2.5)  # clamp boost
                ord[x, y] = min(255, int(r_data[x, y] * factor))
                ogd[x, y] = min(255, int(g_data[x, y] * factor))
                obd[x, y] = min(255, int(b_data[x, y] * factor))
            else:
                ord[x, y] = r_data[x, y]
                ogd[x, y] = g_data[x, y]
                obd[x, y] = b_data[x, y]
                
    rgba = Image.merge('RGBA', (out_r, out_g, out_b, alpha_smooth))
    return rgba

print("Asset processing library ready.")

