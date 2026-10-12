import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { ArtImage, ReviewMap } from './src/lib/artReview';

/**
 * 개발 서버에서만 동작하는 에셋 검수 API (Lab의 "에셋 검수" 탭이 쓴다).
 *   GET  /api/art            → { slots, images, review }
 *   GET  /api/art/file?path= → 이미지 파일 그대로 (검수 화면의 미리보기)
 *   POST /api/art/review     → { 경로: 'ok' | 'no' | null } 를 review.json에 합친다 (null은 대기로 되돌림)
 *   POST /api/art/apply      → NO로 표시한 파일을 지운다. 게임 코드가 쓰는 파일은 지우지 않는다.
 * 건드리는 경로는 `apps/game/public/art`와 `docs/art` 아래의 이미지뿐이다.
 */
const REPO = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const ROOTS = ['apps/game/public/art', 'docs/art'];
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const SLOTS_FILE = join(REPO, 'docs/art/battle-slots.json');
const REVIEW_FILE = join(REPO, 'docs/art/review.json');
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.git', 'art-inbox']);

const toPosix = (p: string) => p.split(sep).join('/');

/** 저장소 안의 허용된 이미지 경로인지 확인하고 절대 경로를 돌려준다 (그 밖이면 null) */
export function resolveArtPath(relative: string): string | null {
  if (!relative || relative.includes('\0')) return null;
  const abs = resolve(REPO, relative);
  const rel = toPosix(abs.slice(REPO.length + 1));
  if (!abs.startsWith(REPO + sep)) return null;
  if (!ROOTS.some((r) => rel.startsWith(r + '/'))) return null;
  if (!IMAGE_EXT.has(extname(abs).toLowerCase())) return null;
  return abs;
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (IMAGE_EXT.has(extname(name).toLowerCase())) out.push(full);
  }
}

function pngSize(file: string): { width: number; height: number } | null {
  try {
    const b = readFileSync(file);
    if (b.length > 24 && b.toString('latin1', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  } catch {
    // 크기를 못 읽어도 목록에는 나온다
  }
  return null;
}

/** 폴더 아래의 텍스트 파일을 모아 하나의 문자열로 (파일 이름이 불리는지 찾는 용도) */
function corpus(roots: string[], exts: string[], accept: (path: string) => boolean = () => true): string {
  const parts: string[] = [];
  const visit = (p: string) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const n of readdirSync(p)) if (!SKIP_DIRS.has(n)) visit(join(p, n));
    } else if (exts.includes(extname(p)) && accept(p)) parts.push(readFileSync(p, 'utf-8'));
  };
  roots.forEach((r) => visit(join(REPO, r)));
  return parts.join('\n');
}

/** 파일 이름이 다른 이름의 일부(gauge_morale_tug_bar.png 안의 morale_tug_bar.png)로만 나오는 경우를 뺀다 */
export function mentions(text: string, fileName: string): boolean {
  let from = 0;
  for (;;) {
    const i = text.indexOf(fileName, from);
    if (i < 0) return false;
    const before = i > 0 ? text[i - 1] : '/';
    if (!/[A-Za-z0-9_-]/.test(before)) return true;
    from = i + 1;
  }
}

function listImages(): ArtImage[] {
  const files: string[] = [];
  for (const r of ROOTS) if (existsSync(join(REPO, r))) walk(join(REPO, r), files);
  // 게임이 쓰는지는 게임 화면 코드만 본다 (시험 파일과 Lab, 도구가 이름을 적어 둔 것은 "쓴다"로 치지 않는다)
  const codeText = corpus(['apps/game/src', 'apps/game/index.html'], ['.ts', '.tsx', '.js', '.css', '.html'], (p) => !/\.test\.[jt]sx?$/.test(p));
  const docText = corpus(['docs', 'scripts'], ['.html', '.md', '.json', '.py', '.mjs', '.js']);
  return files
    .map((f) => {
      const path = toPosix(f.slice(REPO.length + 1));
      const name = path.slice(path.lastIndexOf('/') + 1);
      const size = extname(f).toLowerCase() === '.png' ? pngSize(f) : null;
      return {
        path,
        bytes: statSync(f).size,
        width: size?.width ?? null,
        height: size?.height ?? null,
        usedByGame: mentions(codeText, name),
        usedByDocs: mentions(docText, name),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeReview(review: ReviewMap) {
  const sorted = Object.fromEntries(Object.entries(review).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(dirname(REVIEW_FILE), { recursive: true });
  writeFileSync(REVIEW_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}

export function artApi(): Plugin {
  return {
    name: 'art-api',
    configureServer(server) {
      server.middlewares.use('/api/art', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const readBody = (done: (payload: unknown) => void) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 2_000_000) req.destroy();
          });
          req.on('end', () => {
            try {
              done(JSON.parse(body || '{}'));
            } catch (error) {
              send(400, { error: error instanceof Error ? error.message : String(error) });
            }
          });
        };

        // 파일 주소는 두 가지: /file?path=경로 (Lab 화면), /file/경로.png (게임 화면 Viewer. 확장자가 주소 끝에 있어야 PixiJS가 그림으로 읽는다)
        if (req.method === 'GET' && (url.pathname === '/file' || url.pathname.startsWith('/file/'))) {
          const wanted = url.pathname === '/file' ? (url.searchParams.get('path') ?? '') : decodeURIComponent(url.pathname.slice('/file/'.length));
          const abs = resolveArtPath(wanted);
          if (!abs || !existsSync(abs)) return send(404, { error: '없는 파일입니다.' });
          res.statusCode = 200;
          res.setHeader('Content-Type', MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          // 게임 화면(다른 포트의 Viewer)이 후보 그림을 끼워 볼 수 있도록 읽기를 허용한다. 개발 서버에서만 켜진다
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.end(readFileSync(abs));
        }
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
          const slots = readJson<{ slots: unknown[] }>(SLOTS_FILE, { slots: [] }).slots;
          return send(200, { slots, images: listImages(), review: readJson<ReviewMap>(REVIEW_FILE, {}) });
        }
        if (req.method === 'POST' && url.pathname === '/review') {
          return readBody((payload) => {
            const changes = payload as Record<string, 'ok' | 'no' | null>;
            const review = readJson<ReviewMap>(REVIEW_FILE, {});
            for (const [path, value] of Object.entries(changes)) {
              if (!resolveArtPath(path)) return send(400, { error: `허용되지 않은 경로입니다 (${path}).` });
              if (value === null) delete review[path];
              else if (value === 'ok' || value === 'no') review[path] = value;
              else return send(400, { error: `ok, no, null 중 하나여야 합니다 (${path}).` });
            }
            writeReview(review);
            send(200, { ok: true, review });
          });
        }
        if (req.method === 'POST' && url.pathname === '/apply') {
          const review = readJson<ReviewMap>(REVIEW_FILE, {});
          const images = new Map(listImages().map((i) => [i.path, i]));
          const deleted: string[] = [];
          const blocked: string[] = [];
          const missing: string[] = [];
          for (const [path, value] of Object.entries(review)) {
            if (value !== 'no') continue;
            const abs = resolveArtPath(path);
            const info = images.get(path);
            if (!abs || !info || !existsSync(abs)) {
              missing.push(path);
              delete review[path];
              continue;
            }
            if (info.usedByGame) {
              blocked.push(path);
              continue;
            }
            unlinkSync(abs);
            deleted.push(path);
            delete review[path];
          }
          writeReview(review);
          return send(200, { ok: true, deleted, blocked, missing });
        }
        send(404, { error: '알 수 없는 요청입니다.' });
      });
    },
  };
}
