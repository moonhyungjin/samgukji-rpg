"""
Script to slice and generate all game-ready UI assets from the design sheets:
- docs/art/ui-sheets/ui-sheet-dark.jpg
- docs/art/ui-sheets/ui-sheet-light.jpg

Outputs to:
- apps/game/public/art/battle/ui/ (runtime web app assets)
- docs/art/ui-sheets/slices/ (documentation and inspection)
"""

import os
import shutil
from PIL import Image

def make_transparent(crop_img, bg_color=None, dist_threshold=22, feather=8):
    """
    Flood-fills from the image perimeter to convert the solid dark canvas background
    into a smooth, anti-aliased transparent alpha channel (RGBA).
    Does NOT affect internal dark colors inside the asset.
    """
    img = crop_img.convert('RGBA')
    w, h = img.size
    
    if bg_color is None:
        corners = [
            img.getpixel((0, 0)),
            img.getpixel((w - 1, 0)),
            img.getpixel((0, h - 1)),
            img.getpixel((w - 1, h - 1))
        ]
        bg_r = sum(c[0] for c in corners) / 4.0
        bg_g = sum(c[1] for c in corners) / 4.0
        bg_b = sum(c[2] for c in corners) / 4.0
    else:
        bg_r, bg_g, bg_b = bg_color[:3]

    mask = [[False for _ in range(w)] for _ in range(h)]
    queue = []
    
    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))

    visited = set()
    while queue:
        x, y = queue.pop()
        if (x, y) in visited:
            continue
        visited.add((x, y))
        
        r, g, b, _ = img.getpixel((x, y))
        dist = ((r - bg_r)**2 + (g - bg_g)**2 + (b - bg_b)**2)**0.5
        if dist <= dist_threshold:
            mask[y][x] = True
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                    queue.append((nx, ny))

    result = Image.new('RGBA', (w, h))
    for y in range(h):
        for x in range(w):
            r, g, b, _ = img.getpixel((x, y))
            if mask[y][x]:
                result.putpixel((x, y), (r, g, b, 0))
            else:
                dist = ((r - bg_r)**2 + (g - bg_g)**2 + (b - bg_b)**2)**0.5
                if dist < dist_threshold + feather:
                    alpha = int(255 * (dist - dist_threshold) / feather)
                    result.putpixel((x, y), (r, g, b, max(0, min(255, alpha))))
                else:
                    result.putpixel((x, y), (r, g, b, 255))
    return result

DARK_MANIFEST = [
    # 1. Portraits
    {"name": "portrait_liu_bei", "box": (554, 55, 646, 155), "category": "portraits", "transparent": False},
    {"name": "portrait_guan_yu", "box": (650, 55, 742, 155), "category": "portraits", "transparent": False},
    {"name": "portrait_zhang_fei", "box": (746, 55, 838, 155), "category": "portraits", "transparent": False},

    # 2. Unit Panels / Cards
    {"name": "card_liu_bei", "box": (17, 56, 528, 168), "category": "cards", "transparent": False},
    {"name": "card_guan_yu_selected", "box": (11, 174, 534, 302), "category": "cards", "transparent": False},
    {"name": "card_guan_yu", "box": (17, 180, 528, 296), "category": "cards", "transparent": False},
    {"name": "card_zhang_fei", "box": (17, 308, 528, 420), "category": "cards", "transparent": False},
    {"name": "card_zhang_fei_guard", "box": (17, 308, 528, 436), "category": "cards", "transparent": False},

    # 3. Class Shields
    {"name": "class_infantry_liu", "box": (843, 55, 893, 112), "category": "classes", "transparent": True},
    {"name": "class_cavalry_spears", "box": (944, 55, 995, 112), "category": "classes", "transparent": True},
    {"name": "class_shield_guard", "box": (843, 137, 894, 194), "category": "classes", "transparent": True},

    # 4. Badges & Plaques
    {"name": "badge_guard_50", "box": (548, 217, 686, 258), "category": "badges", "transparent": True},
    {"name": "badge_round_2", "box": (60, 498, 418, 545), "category": "badges", "transparent": True},
    {"name": "badge_morale", "box": (113, 589, 277, 637), "category": "badges", "transparent": True},

    # 5. Tactical Icons
    {"name": "icon_troops", "box": (757, 217, 801, 263), "category": "icons", "transparent": False},
    {"name": "icon_rank2", "box": (811, 217, 856, 263), "category": "icons", "transparent": False},
    {"name": "icon_cavalry", "box": (866, 217, 913, 263), "category": "icons", "transparent": False},
    {"name": "icon_charge", "box": (916, 217, 962, 263), "category": "icons", "transparent": False},
    {"name": "icon_rank3", "box": (960, 217, 1005, 262), "category": "icons", "transparent": False},

    # 6. AP Gauges (Single 3D cubes and 4-block status bars)
    {"name": "ap_cube_available", "box": (563, 363, 588, 388), "category": "ap", "transparent": True},
    {"name": "ap_cube_depleted", "box": (680, 363, 705, 388), "category": "ap", "transparent": True},
    {"name": "ap_bar_4_full", "box": (563, 316, 659, 345), "category": "ap", "transparent": True},
    {"name": "ap_bar_3_active", "box": (679, 316, 775, 345), "category": "ap", "transparent": True},
    {"name": "ap_bar_2_active", "box": (795, 316, 891, 345), "category": "ap", "transparent": True},
    {"name": "ap_bar_1_active", "box": (911, 316, 1007, 345), "category": "ap", "transparent": True},

    # 7. HP Bars (Clean capsule bars without outer numbers)
    {"name": "hp_bar_100", "box": (563, 437, 836, 454), "category": "hp", "transparent": True},
    {"name": "hp_bar_76", "box": (563, 466, 836, 483), "category": "hp", "transparent": True},
    {"name": "hp_bar_42", "box": (563, 495, 836, 512), "category": "hp", "transparent": True},

    # 8. Battle Frame & Gauges
    {"name": "morale_tug_bar", "box": (18, 552, 382, 584), "category": "frames", "transparent": True},
    {"name": "corner_bracket_left", "box": (19, 596, 97, 650), "category": "frames", "transparent": True},
    {"name": "corner_bracket_angular_l", "box": (288, 594, 342, 646), "category": "frames", "transparent": True},
    {"name": "corner_bracket_angular_r", "box": (342, 594, 386, 646), "category": "frames", "transparent": True},

    # 9. UI Buttons
    {"name": "btn_battle_log", "box": (434, 565, 545, 606), "category": "buttons", "transparent": True},
    {"name": "btn_speed_2x", "box": (552, 565, 642, 606), "category": "buttons", "transparent": True},
    {"name": "btn_auto", "box": (650, 565, 730, 606), "category": "buttons", "transparent": True},

    # 10. Decorative Elements
    {"name": "decor_acanthus_corner_1", "box": (745, 563, 801, 647), "category": "decor", "transparent": True},
    {"name": "decor_acanthus_corner_2", "box": (806, 563, 911, 647), "category": "decor", "transparent": True},
    {"name": "banner_shu_silk", "box": (910, 550, 977, 665), "category": "decor", "transparent": True},
]

LIGHT_MANIFEST = [
    # 1. Portraits
    {"name": "portrait_liu_bei", "box": (502, 55, 597, 155), "category": "portraits", "transparent": False},
    {"name": "portrait_guan_yu", "box": (606, 55, 701, 155), "category": "portraits", "transparent": False},
    {"name": "portrait_zhang_fei", "box": (707, 55, 802, 155), "category": "portraits", "transparent": False},

    # 2. Unit Panels / Cards
    {"name": "card_liu_bei", "box": (17, 50, 514, 149), "category": "cards", "transparent": False},
    {"name": "card_guan_yu_selected", "box": (11, 156, 486, 276), "category": "cards", "transparent": False},
    {"name": "card_guan_yu", "box": (17, 162, 480, 270), "category": "cards", "transparent": False},
    {"name": "card_zhang_fei", "box": (17, 283, 514, 382), "category": "cards", "transparent": False},
    {"name": "card_zhang_fei_guard", "box": (17, 283, 514, 410), "category": "cards", "transparent": False},

    # 3. Class Shields
    {"name": "class_infantry_liu", "box": (821, 55, 875, 114), "category": "classes", "transparent": True},
    {"name": "class_cavalry_spears", "box": (885, 55, 941, 114), "category": "classes", "transparent": True},
    {"name": "class_shield_zhang", "box": (950, 55, 1008, 114), "category": "classes", "transparent": True},

    # 4. Badges & Plaques
    {"name": "badge_guard_50", "box": (503, 221, 615, 261), "category": "badges", "transparent": True},
    {"name": "badge_round_2", "box": (58, 443, 415, 486), "category": "badges", "transparent": True},
    {"name": "badge_morale", "box": (114, 545, 314, 600), "category": "badges", "transparent": True},

    # 5. Tactical Icons
    {"name": "icon_troops", "box": (634, 220, 680, 265), "category": "icons", "transparent": False},
    {"name": "icon_rank2", "box": (680, 220, 726, 265), "category": "icons", "transparent": False},
    {"name": "icon_sword", "box": (725, 220, 771, 265), "category": "icons", "transparent": False},
    {"name": "icon_rank3", "box": (775, 220, 821, 265), "category": "icons", "transparent": False},
    {"name": "icon_shield", "box": (847, 220, 893, 265), "category": "icons", "transparent": False},
    {"name": "icon_bull", "box": (904, 220, 951, 265), "category": "icons", "transparent": False},
    {"name": "icon_bow", "box": (960, 220, 1006, 265), "category": "icons", "transparent": False},

    # 6. AP Gauges
    {"name": "ap_cube_available", "box": (507, 420, 532, 445), "category": "ap", "transparent": True},
    {"name": "ap_cube_depleted", "box": (620, 420, 645, 445), "category": "ap", "transparent": True},
    {"name": "ap_bar_4_full", "box": (507, 331, 603, 360), "category": "ap", "transparent": True},
    {"name": "ap_bar_3_active", "box": (615, 330, 705, 360), "category": "ap", "transparent": True},
    {"name": "ap_bar_1_active", "box": (507, 375, 603, 405), "category": "ap", "transparent": True},
    {"name": "ap_bar_0_empty", "box": (615, 375, 705, 405), "category": "ap", "transparent": True},

    # 7. HP Bars
    {"name": "hp_bar_100", "box": (716, 323, 919, 342), "category": "hp", "transparent": True},
    {"name": "hp_bar_76", "box": (716, 355, 919, 374), "category": "hp", "transparent": True},
    {"name": "hp_bar_54", "box": (716, 387, 919, 406), "category": "hp", "transparent": True},

    # 8. Battle Frame & Gauges
    {"name": "morale_tug_bar", "box": (17, 508, 438, 542), "category": "frames", "transparent": True},
    {"name": "corner_bracket_left", "box": (20, 550, 110, 625), "category": "frames", "transparent": True},
    {"name": "corner_bracket_right", "box": (340, 550, 420, 625), "category": "frames", "transparent": True},

    # 9. UI Buttons
    {"name": "btn_battle_log", "box": (463, 521, 556, 571), "category": "buttons", "transparent": True},
    {"name": "btn_speed_2x", "box": (564, 521, 630, 571), "category": "buttons", "transparent": True},
    {"name": "btn_auto", "box": (636, 521, 713, 571), "category": "buttons", "transparent": True},

    # 10. Decorative Elements
    {"name": "decor_acanthus_corner_1", "box": (733, 520, 804, 624), "category": "decor", "transparent": True},
    {"name": "decor_acanthus_corner_2", "box": (806, 520, 915, 624), "category": "decor", "transparent": True},
    {"name": "banner_shu_silk", "box": (916, 510, 982, 642), "category": "decor", "transparent": True},
]

def process_theme(theme_name, sheet_path, manifest, dist_thresh=22):
    img = Image.open(sheet_path)
    out_dirs = [
        f"apps/game/public/art/battle/ui/{theme_name}",
        f"docs/art/ui-sheets/slices/{theme_name}"
    ]
    for d in out_dirs:
        os.makedirs(d, exist_ok=True)
    
    print(f"=== Processing Theme: {theme_name.upper()} ===")
    results = []
    
    for item in manifest:
        name = item["name"]
        box = item["box"]
        crop = img.crop(box)
        
        # Save regular crop
        for d in out_dirs:
            solid_file = os.path.join(d, f"{name}.png")
            crop.save(solid_file)
            
        # Transparent version if applicable
        if item.get("transparent", False):
            trans = make_transparent(crop, dist_threshold=dist_thresh)
            for d in out_dirs:
                trans_file = os.path.join(d, f"{name}_trans.png")
                trans.save(trans_file)
                
        results.append({
            "name": name,
            "category": item["category"],
            "size": crop.size,
            "has_trans": item.get("transparent", False)
        })
        print(f"  [OK] {name}: {crop.size} (trans={item.get('transparent', False)})")
        
    return results

def main():
    print("Starting UI Asset Generation...")
    dark_results = process_theme("dark", "docs/art/ui-sheets/ui-sheet-dark.jpg", DARK_MANIFEST, dist_thresh=24)
    light_results = process_theme("light", "docs/art/ui-sheets/ui-sheet-light.jpg", LIGHT_MANIFEST, dist_thresh=22)
    
    # Also copy primary dark assets to apps/game/public/art/battle/ui/ root
    root_ui = "apps/game/public/art/battle/ui"
    dark_dir = os.path.join(root_ui, "dark")
    for fname in os.listdir(dark_dir):
        shutil.copy2(os.path.join(dark_dir, fname), os.path.join(root_ui, fname))
    print(f"Synced {len(os.listdir(dark_dir))} files to {root_ui}/")
    
    print("\n UI Asset Generation Completed Successfully!")

if __name__ == "__main__":
    main()
