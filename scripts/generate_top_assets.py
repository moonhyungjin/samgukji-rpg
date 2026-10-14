"""
Script to generate all Top-Section Battle UI & Environment Assets:
1. Header Bar HUD Components (Plaques, Morale Tug Bar, Indicator Pointer, Corner Decors)
2. Battlefield Background Landscape & War Environment Assets (Flags, Selection Rings, Cutin Frame)

Inputs:
- docs/art/rance-mockup/user-sample-2-dark.jpg
- docs/art/ui-sheets/ui-sheet-dark.jpg
- docs/art/ui-sheets/ui-sheet-light.jpg

Outputs:
- apps/game/public/art/battle/ui/header/ (Runtime Header UI Assets)
- apps/game/public/art/battle/ (Battlefield Background Landscape)
- docs/art/ui-sheets/top-section/ (Inspection & Slices)
"""

import os
from PIL import Image

def make_transparent(crop_img, bg_color=None, dist_threshold=22, feather=8):
    """
    Flood-fills from perimeter to convert dark/solid outer canvas into smooth transparent alpha.
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

def main():
    print("=== Generating Top Section Assets ===")
    
    sample2_path = "docs/art/rance-mockup/user-sample-2-dark.jpg"
    sheet_dark_path = "docs/art/ui-sheets/ui-sheet-dark.jpg"
    
    out_header_runtime = "apps/game/public/art/battle/ui/header"
    out_battle_runtime = "apps/game/public/art/battle"
    out_docs = "docs/art/ui-sheets/top-section"
    
    os.makedirs(out_header_runtime, exist_ok=True)
    os.makedirs(out_docs, exist_ok=True)
    
    im_sample2 = Image.open(sample2_path)
    im_sheet_dark = Image.open(sheet_dark_path)
    
    generated = []
    
    # -------------------------------------------------------------
    # 1. 최상단 헤더 전체 배경 바 (header_bg_bar.png: 1024 x 46)
    # -------------------------------------------------------------
    header_bg = im_sample2.crop((0, 0, 1024, 46))
    header_bg.save(os.path.join(out_header_runtime, "header_bg_bar.png"))
    header_bg.save(os.path.join(out_docs, "header_bg_bar.png"))
    generated.append(("header_bg_bar.png", header_bg.size, "최상단 앤티크 흑단목 골드 베벨 헤더 바 베이스", False))

    # -------------------------------------------------------------
    # 2. [촉군(蜀軍)] 진영 조각 현판 (plaque_faction_shu.png: 200 x 42)
    # -------------------------------------------------------------
    crop_shu = im_sample2.crop((120, 2, 320, 44))
    crop_shu_trans = make_transparent(crop_shu, dist_threshold=20, feather=6)
    crop_shu.save(os.path.join(out_docs, "plaque_faction_shu_solid.png"))
    crop_shu_trans.save(os.path.join(out_header_runtime, "plaque_faction_shu.png"))
    crop_shu_trans.save(os.path.join(out_docs, "plaque_faction_shu.png"))
    generated.append(("plaque_faction_shu.png", crop_shu_trans.size, "촉군(蜀軍) 용·구름 조각 앤티크 현판 (투명 RGBA)", True))

    # -------------------------------------------------------------
    # 3. [황건군(黃巾軍)] 진영 조각 현판 (plaque_faction_yellow.png: 200 x 42)
    # -------------------------------------------------------------
    crop_yellow = im_sample2.crop((704, 2, 904, 44))
    crop_yellow_trans = make_transparent(crop_yellow, dist_threshold=20, feather=6)
    crop_yellow.save(os.path.join(out_docs, "plaque_faction_yellow_solid.png"))
    crop_yellow_trans.save(os.path.join(out_header_runtime, "plaque_faction_yellow.png"))
    crop_yellow_trans.save(os.path.join(out_docs, "plaque_faction_yellow.png"))
    generated.append(("plaque_faction_yellow.png", crop_yellow_trans.size, "황건군(黃巾軍) 호랑이·구름 조각 앤티크 현판 (투명 RGBA)", True))

    # -------------------------------------------------------------
    # 4. [2 라운드] 중앙 황금 현판 (plaque_round_2.png: 204 x 28)
    # -------------------------------------------------------------
    crop_round = im_sample2.crop((410, 0, 614, 28))
    crop_round_trans = make_transparent(crop_round, dist_threshold=18, feather=6)
    crop_round.save(os.path.join(out_docs, "plaque_round_2_solid.png"))
    crop_round_trans.save(os.path.join(out_header_runtime, "plaque_round_2.png"))
    crop_round_trans.save(os.path.join(out_docs, "plaque_round_2.png"))
    generated.append(("plaque_round_2.png", crop_round_trans.size, "2 라운드 중앙 황금 앤티크 현판 (투명 RGBA)", True))

    # -------------------------------------------------------------
    # 4-B. [2 라운드] 쌍룡 조각 대형 현판 (시트 고해상도: 358 x 47)
    # -------------------------------------------------------------
    crop_round_large = im_sheet_dark.crop((60, 498, 418, 545))
    crop_round_large_trans = make_transparent(crop_round_large, dist_threshold=22, feather=8)
    crop_round_large_trans.save(os.path.join(out_header_runtime, "plaque_round_dragons_ornate.png"))
    crop_round_large_trans.save(os.path.join(out_docs, "plaque_round_dragons_ornate.png"))
    generated.append(("plaque_round_dragons_ornate.png", crop_round_large_trans.size, "쌍룡 조각 2 라운드 대형 현판 (시트 원본 투명 RGBA)", True))

    # -------------------------------------------------------------
    # 5. 사기 줄다리기 우세도 게이지 바 (gauge_morale_tug_bar.png: 328 x 18)
    # -------------------------------------------------------------
    crop_tug = im_sample2.crop((348, 26, 676, 44))
    crop_tug_trans = make_transparent(crop_tug, dist_threshold=18, feather=6)
    crop_tug.save(os.path.join(out_docs, "gauge_morale_tug_bar_solid.png"))
    crop_tug_trans.save(os.path.join(out_header_runtime, "gauge_morale_tug_bar.png"))
    crop_tug_trans.save(os.path.join(out_docs, "gauge_morale_tug_bar.png"))
    generated.append(("gauge_morale_tug_bar.png", crop_tug_trans.size, "사기(士氣) 줄다리기 우세도 게이지 트랙 바 (청/적 골드림, 투명 RGBA)", True))

    # -------------------------------------------------------------
    # 6. 우세도 역삼각형 인디케이터 침 (pointer_morale_indicator.png: 16 x 14)
    # -------------------------------------------------------------
    # Generate crisp golden pointer with shadow
    pointer_img = Image.new('RGBA', (16, 14), (0, 0, 0, 0))
    # Draw triangle down
    import math
    for y in range(12):
        half_w = int(6 * (1.0 - y / 12.0))
        for x in range(8 - half_w, 8 + half_w + 1):
            # golden gradient
            r = int(255)
            g = int(215 + 40 * (1.0 - y / 12.0))
            b = int(50)
            pointer_img.putpixel((x, y), (r, min(255, g), b, 255))
            # border outline
            if x == 8 - half_w or x == 8 + half_w or y == 0:
                pointer_img.putpixel((x, y), (255, 255, 200, 255))
    pointer_img.save(os.path.join(out_header_runtime, "pointer_morale_indicator.png"))
    pointer_img.save(os.path.join(out_docs, "pointer_morale_indicator.png"))
    generated.append(("pointer_morale_indicator.png", (16, 14), "사기 우세 인디케이터 역삼각형 골드 침 (투명 RGBA)", True))

    # -------------------------------------------------------------
    # 7. 최상단 좌/우 앤티크 황동 모서리 브래킷 (decor_header_bracket_l/r.png: 54 x 52)
    # -------------------------------------------------------------
    bracket_l = im_sheet_dark.crop((288, 594, 342, 646))
    bracket_l_trans = make_transparent(bracket_l, dist_threshold=22, feather=8)
    bracket_l_trans.save(os.path.join(out_header_runtime, "decor_header_bracket_l.png"))
    bracket_l_trans.save(os.path.join(out_docs, "decor_header_bracket_l.png"))
    
    bracket_r_trans = bracket_l_trans.transpose(Image.FLIP_LEFT_RIGHT)
    bracket_r_trans.save(os.path.join(out_header_runtime, "decor_header_bracket_r.png"))
    bracket_r_trans.save(os.path.join(out_docs, "decor_header_bracket_r.png"))
    generated.append(("decor_header_bracket_l.png", bracket_l_trans.size, "최상단 좌측 앤티크 90도 황동 코너 브래킷 (투명 RGBA)", True))
    generated.append(("decor_header_bracket_r.png", bracket_r_trans.size, "최상단 우측 앤티크 90도 황동 코너 브래킷 (투명 RGBA)", True))

    # -------------------------------------------------------------
    # 8. 전장 배경 랜드스케이프 고화질 원본 (battlefield_camp_bg.png: 1024 x 316)
    # -------------------------------------------------------------
    field_crop = im_sample2.crop((0, 46, 1024, 362))
    field_crop.save(os.path.join(out_battle_runtime, "battlefield_camp_bg.png"))
    field_crop.save(os.path.join(out_docs, "battlefield_camp_bg.png"))
    generated.append(("battlefield_camp_bg.png", field_crop.size, "전장 원경 산맥 + 목책 진지 + 평원 랜드스케이프 배경", False))

    # -------------------------------------------------------------
    # 9. 촉군 청록 비단 군기 (劉) (banner_shu_silk_flag.png: 67 x 115)
    # -------------------------------------------------------------
    banner_shu = im_sheet_dark.crop((910, 550, 977, 665))
    banner_shu_trans = make_transparent(banner_shu, dist_threshold=22, feather=8)
    banner_shu_trans.save(os.path.join(out_header_runtime, "banner_shu_silk_flag.png"))
    banner_shu_trans.save(os.path.join(out_docs, "banner_shu_silk_flag.png"))
    generated.append(("banner_shu_silk_flag.png", banner_shu_trans.size, "촉군 청록 비단 군기 (劉) (투명 RGBA)", True))

    # -------------------------------------------------------------
    # 10. 지면 장수 선택 링 (fx_ground_selection_ring.png: 105 x 24)
    # -------------------------------------------------------------
    ring_crop = im_sample2.crop((254, 218, 359, 242))
    ring_trans = make_transparent(ring_crop, dist_threshold=25, feather=6)
    ring_trans.save(os.path.join(out_battle_runtime, "fx_ground_selection_ring.png"))
    ring_trans.save(os.path.join(out_docs, "fx_ground_selection_ring.png"))
    generated.append(("fx_ground_selection_ring.png", ring_trans.size, "지면 군단 선택 황금빛 펄스 링 (투명 RGBA)", True))

    # -------------------------------------------------------------
    # 11. 대사 컷인 프레임 액자 (frame_speech_cutin.png: 76 x 72)
    # -------------------------------------------------------------
    cutin_box = im_sheet_dark.crop((650, 55, 742, 155)) # Guan Yu frame
    cutin_frame = cutin_box.resize((76, 72))
    cutin_frame.save(os.path.join(out_header_runtime, "frame_speech_cutin.png"))
    cutin_frame.save(os.path.join(out_docs, "frame_speech_cutin.png"))
    generated.append(("frame_speech_cutin.png", (76, 72), "대사 컷인 장수 흉상 황동 액자 프레임", False))

    # -------------------------------------------------------------
    # 12. 행동 순서 타임라인 레일 바 배경 (rail_turn_order_bg.png: 1024 x 26)
    # -------------------------------------------------------------
    rail_img = Image.new('RGBA', (1024, 26), (13, 19, 26, 255))
    # Add top border line (0x334155) and bottom border (0x000)
    for x in range(1024):
        rail_img.putpixel((x, 0), (51, 65, 85, 255))
        rail_img.putpixel((x, 25), (0, 0, 0, 255))
        rail_img.putpixel((x, 24), (20, 26, 35, 255))
    rail_img.save(os.path.join(out_header_runtime, "rail_turn_order_bg.png"))
    rail_img.save(os.path.join(out_docs, "rail_turn_order_bg.png"))
    generated.append(("rail_turn_order_bg.png", (1024, 26), "가로형 행동 순서 타임라인 레일 바 베이스 배경", False))

    print(f"\nSuccessfully generated {len(generated)} Top Section Assets:")
    for fname, size, desc, trans in generated:
        print(f"  - {fname:<30} {str(size):<12} (RGBA={trans}) : {desc}")

if __name__ == "__main__":
    main()

