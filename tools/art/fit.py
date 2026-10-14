"""그림이 슬롯의 조건(비율, 크기, 투명)에 맞는지 검사한다. 파일을 바꾸거나 옮기지 않는다.

  python tools/art/fit.py                    # 조건이 있는 슬롯의 후보 그림을 전부 검사
  python tools/art/fit.py A2                 # 슬롯 하나만
  python tools/art/fit.py path/to/file.png A2   # 이 파일이 A2 슬롯에 맞는지 (아직 슬롯에 안 들어간 새 그림 확인용)

조건은 docs/art/battle-slots.json의 슬롯(regions, spec)이다. Lab 에셋 검수의 맞춤 검사(artSpec.ts)와 같은 기준이다:
  비율 : 슬롯 영역의 가로세로 비율과 8% 안으로 같아야 한다
  크기 : 가로가 표시 크기의 0.9배 ~ 2.2배 (표시 크기의 2배까지만 만든다)
  투명 : spec.transparent인 슬롯은 PNG에 알파 채널이 있어야 한다
"""
import fnmatch
import json
import os
import struct
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RATIO_TOLERANCE = 0.08
MAX_SCALE = 2


def png_info(path):
    """(가로, 세로, 알파 채널 여부). PNG가 아니면 None."""
    try:
        with open(path, 'rb') as f:
            head = f.read(26)
    except OSError:
        return None
    if len(head) < 26 or head[1:4] != b'PNG':
        return None
    w, h = struct.unpack('>II', head[16:24])
    return w, h, head[25] in (4, 6)


def check(path, slot):
    """맞지 않는 이유 목록 (비어 있으면 맞음)."""
    info = png_info(path)
    region = (slot.get('regions') or [None])[0]
    spec = slot.get('spec')
    if info is None or region is None or spec is None:
        return None
    w, h, alpha = info
    problems = []
    want = region['w'] / region['h']
    have = w / h
    if abs(have / want - 1) > RATIO_TOLERANCE:
        problems.append(f'비율 {have:.2f}:1 (슬롯 {want:.2f}:1)')
    if not (region['w'] * 0.9 <= w <= region['w'] * MAX_SCALE * 1.1):
        problems.append(f'가로 {w}px (슬롯 {region["w"]}~{region["w"] * MAX_SCALE}px)')
    if spec.get('transparent') and not alpha:
        problems.append('투명 채널 없음')
    return problems


def matches(slot):
    out = []
    patterns = slot.get('match') or []
    for base, dirs, files in os.walk(os.path.join(ROOT, 'docs', 'art')):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'art-inbox')]
        for f in files:
            rel = os.path.relpath(os.path.join(base, f), ROOT).replace(os.sep, '/')
            if any(fnmatch.fnmatchcase(rel, p) for p in patterns):
                out.append(rel)
    for base, dirs, files in os.walk(os.path.join(ROOT, 'apps', 'game', 'public', 'art')):
        for f in files:
            rel = os.path.relpath(os.path.join(base, f), ROOT).replace(os.sep, '/')
            if any(fnmatch.fnmatchcase(rel, p) for p in patterns):
                out.append(rel)
    return sorted(set(out))


def main(argv):
    slots = json.load(open(os.path.join(ROOT, 'docs', 'art', 'battle-slots.json'), encoding='utf-8'))['slots']
    by_id = {s['id']: s for s in slots}
    bad = 0
    if len(argv) == 2 and argv[0].lower().endswith('.png'):
        slot = by_id.get(argv[1])
        if not slot or not slot.get('spec'):
            print(f'{argv[1]}에는 제작 조건(spec)이 없습니다.')
            return 2
        problems = check(argv[0], slot)
        print(('맞음' if not problems else '안 맞음: ' + ', '.join(problems or [])) if problems is not None else 'PNG를 읽지 못했습니다.')
        return 1 if problems else 0
    wanted = set(argv)
    for slot in slots:
        if not slot.get('spec') or (wanted and slot['id'] not in wanted):
            continue
        files = matches(slot)
        print(f'{slot["id"]} {slot["name"]}: 후보 {len(files)}개')
        for rel in files:
            problems = check(os.path.join(ROOT, rel), slot)
            if problems is None:
                continue
            mark = '  ✓' if not problems else '  ✗'
            if problems:
                bad += 1
            print(f'{mark} {rel}' + (f'  — {", ".join(problems)}' if problems else ''))
    print(f'\n맞지 않는 그림 {bad}개')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
