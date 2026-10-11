"""아트 에셋 점검: 어떤 이미지가 어디서 쓰이는지, 같은 내용이 몇 벌인지, 용량을 얼마나 차지하는지 표로 보여 준다.

  python tools/art/audit.py            # 요약 + 폴더별 표
  python tools/art/audit.py --orphans  # 어디서도 안 쓰는 파일 목록
  python tools/art/audit.py --dups     # 같은 내용의 파일 묶음

분류 (파일 이름이 문서/코드에 나오는지만 본다. 이름을 조합해서 불러오면 놓칠 수 있으니 지우기 전에 확인한다):
  게임   : apps/game/src, apps/game/index.html, apps/balance-lab/src, packages, tools 의 코드가 쓴다
  문서   : docs/**/*.html, *.md, *.json, scripts/*, 그 밖의 문서가 쓴다 (시안 보기 페이지, 에셋 만드는 스크립트)
  고아   : 어디에서도 안 쓴다 -> art-inbox/ 로 옮겨도 아무것도 깨지지 않는다
이 스크립트는 파일을 지우거나 옮기지 않는다.
"""
import collections
import hashlib
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(ROOT)
IMG = ('.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif')
ART_ROOTS = ['apps/game/public/art', 'docs/art']
CODE_ROOTS = ['apps/game/src', 'apps/game/index.html', 'apps/balance-lab/src', 'packages', 'tools']
CODE_EXT = ('.ts', '.tsx', '.js', '.mjs', '.css', '.json')
DOC_EXT = ('.html', '.md', '.json', '.py', '.mjs', '.js', '.txt')
SKIP = {'node_modules', 'dist', 'out', '.git', 'art-inbox'}


def read(path):
    try:
        return open(path, encoding='utf-8', errors='ignore').read()
    except OSError:
        return ''


def collect(roots, exts):
    text = []
    for root in roots:
        if os.path.isfile(root):
            text.append(read(root))
            continue
        for d, ds, fs in os.walk(root):
            ds[:] = [x for x in ds if x not in SKIP]
            for f in fs:
                if f.endswith(exts):
                    text.append(read(os.path.join(d, f)))
    return '\n'.join(text)


def images(root):
    for d, ds, fs in os.walk(root):
        ds[:] = [x for x in ds if x not in SKIP]
        for f in fs:
            if f.lower().endswith(IMG):
                yield os.path.join(d, f).replace(os.sep, '/')


code_text = collect(CODE_ROOTS, CODE_EXT)
doc_text = collect(['docs', 'scripts', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'TODO.md'], DOC_EXT)
tracked = set(subprocess.run(['git', 'ls-files'], capture_output=True, text=True).stdout.split('\n'))


def mentions(text, path):
    """파일 이름이 다른 이름의 일부로만 나오는 경우(gauge_morale_tug_bar.png 안의 morale_tug_bar.png)를 제외한다."""
    name = os.path.basename(path)
    start = 0
    while True:
        i = text.find(name, start)
        if i < 0:
            return False
        before = text[i - 1] if i > 0 else '/'
        if not (before.isalnum() or before in '_-'):
            return True
        start = i + 1


rows = []
for root in ART_ROOTS:
    for p in images(root):
        # 같은 폴더의 문서가 자기 이미지를 부르는 경우도 "문서"로 센다 (자기 자신은 이미지라 텍스트가 아니다)
        kind = 'game' if mentions(code_text, p) else 'docs' if mentions(doc_text, p) else 'orphan'
        rows.append({'path': p, 'size': os.path.getsize(p), 'kind': kind, 'tracked': p in tracked})


def mb(n):
    return f'{n / 1e6:.1f}MB'


def digest(p):
    return hashlib.md5(open(p, 'rb').read()).hexdigest()


args = set(sys.argv[1:])
if '--orphans' in args:
    for r in sorted(rows, key=lambda r: -r['size']):
        if r['kind'] == 'orphan':
            print(f"{r['size'] / 1e3:8.0f}KB  {'추적' if r['tracked'] else '미추적'}  {r['path']}")
    sys.exit(0)

groups = collections.defaultdict(list)
for r in rows:
    groups[digest(r['path'])].append(r)
dups = [g for g in groups.values() if len(g) > 1]
if '--dups' in args:
    for g in sorted(dups, key=lambda g: -g[0]['size']):
        print(f"{g[0]['size'] / 1e3:.0f}KB x{len(g)}")
        for r in g:
            print('   ', r['path'], f"[{r['kind']}]")
    sys.exit(0)

total = sum(r['size'] for r in rows)
print(f'이미지 {len(rows)}개, {mb(total)} (git 추적 {sum(1 for r in rows if r["tracked"])}개)')
for kind, label in (('game', '게임이 쓴다'), ('docs', '문서/스크립트만 쓴다'), ('orphan', '어디서도 안 쓴다')):
    sel = [r for r in rows if r['kind'] == kind]
    print(f'  {label}: {len(sel)}개 {mb(sum(r["size"] for r in sel))}')
waste = sum(sum(r['size'] for r in g[1:]) for g in dups)
print(f'  내용이 같은 파일 묶음 {len(dups)}개, 중복으로 낭비되는 용량 {mb(waste)}')
print()
by_dir = collections.defaultdict(list)
for r in rows:
    by_dir[os.path.dirname(r['path'])].append(r)
print(f"{'폴더':58} {'개수':>5} {'용량':>8}  {'게임':>5} {'문서':>5} {'고아':>5}")
for d, rs in sorted(by_dir.items()):
    c = collections.Counter(r['kind'] for r in rs)
    print(f"{d:58} {len(rs):5d} {mb(sum(r['size'] for r in rs)):>8}  {c['game']:5d} {c['docs']:5d} {c['orphan']:5d}")
