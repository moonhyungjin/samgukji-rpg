import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// 장수/기본 편성 데이터의 원본 파일. 편집기에서 저장하면 이 파일이 바뀌고, Lab/게임/시뮬레이터가 이 파일을 읽는다.
const FILES = {
  characters: fileURLToPath(new URL('../../packages/game-data/data/characters.json', import.meta.url)),
  presets: fileURLToPath(new URL('../../packages/game-data/data/presets.json', import.meta.url)),
};

type Json = Record<string, unknown>;

/** 저장 전에 모양을 확인한다. 문제가 있으면 사람이 읽을 수 있는 메시지를 돌려준다. */
function checkCharacters(list: Json[]): string | null {
  for (const c of list) {
    const stats = c?.stats as Json | undefined;
    if (typeof c?.id !== 'string' || typeof c?.name !== 'string' || typeof c?.unitType !== 'string' || !stats) {
      return 'id, name, unitType, stats가 없는 항목이 있습니다.';
    }
    if (Object.values(stats).some((v) => typeof v !== 'number' || !Number.isFinite(v))) return `${String(c.id)}: 스탯은 숫자여야 합니다.`;
  }
  return null;
}

function checkPresets(list: Json[]): string | null {
  for (const p of list) {
    if (typeof p?.id !== 'string' || typeof p?.label !== 'string' || !Array.isArray(p?.lineup)) return 'id, label, lineup이 없는 편성이 있습니다.';
    for (const e of p.lineup as Json[]) {
      if (typeof e?.characterId !== 'string' || (e.row !== 'front' && e.row !== 'back')) return `${p.id}: 군단은 characterId와 row(front/back)가 필요합니다.`;
    }
  }
  return null;
}

/** 개발 서버에서만 동작하는 저장 API. GET은 파일 내용, POST는 파일에 쓴다. */
function dataApi(): Plugin {
  const routes: { path: string; file: string; check: (list: Json[]) => string | null }[] = [
    { path: '/api/characters', file: FILES.characters, check: checkCharacters },
    { path: '/api/presets', file: FILES.presets, check: checkPresets },
  ];
  return {
    name: 'data-api',
    configureServer(server) {
      for (const route of routes) {
        server.middlewares.use(route.path, (req, res) => {
          const send = (status: number, body: unknown) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
          };
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(readFileSync(route.file, 'utf-8'));
            return;
          }
          if (req.method !== 'POST') return send(405, { error: 'GET 또는 POST만 가능합니다.' });
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 2_000_000) req.destroy();
          });
          req.on('end', () => {
            try {
              const list = JSON.parse(body) as unknown;
              if (!Array.isArray(list) || list.length === 0) return send(400, { error: '비어 있지 않은 목록(배열)이 필요합니다.' });
              const problem = route.check(list as Json[]);
              if (problem) return send(400, { error: problem });
              writeFileSync(route.file, JSON.stringify(list, null, 2) + '\n', 'utf-8');
              send(200, { ok: true, count: list.length });
            } catch (error) {
              send(400, { error: error instanceof Error ? error.message : String(error) });
            }
          });
        });
      }
    },
  };
}

// Lab(5173), 게임(5174)과 동시에 띄울 수 있도록 포트를 분리한다.
export default defineConfig({
  plugins: [react(), dataApi()],
  server: { port: 5175 },
});
