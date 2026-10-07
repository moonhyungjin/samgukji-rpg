import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// 장수 데이터의 원본 파일. 편집기에서 저장하면 이 파일이 바뀌고, Lab/게임/시뮬레이터가 이 파일을 읽는다.
const CHARACTERS_FILE = fileURLToPath(new URL('../../packages/game-data/data/characters.json', import.meta.url));

/** 개발 서버에서만 동작하는 저장 API. GET은 파일 내용, POST는 파일에 쓴다. */
function charactersApi(): Plugin {
  return {
    name: 'characters-api',
    configureServer(server) {
      server.middlewares.use('/api/characters', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(readFileSync(CHARACTERS_FILE, 'utf-8'));
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
            if (!Array.isArray(list) || list.length === 0) return send(400, { error: '장수 목록(배열)이 필요합니다.' });
            for (const c of list as Record<string, unknown>[]) {
              const stats = c?.stats as Record<string, unknown> | undefined;
              if (typeof c?.id !== 'string' || typeof c?.name !== 'string' || typeof c?.unitType !== 'string' || !stats) {
                return send(400, { error: 'id, name, unitType, stats가 없는 항목이 있습니다.' });
              }
              if (Object.values(stats).some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
                return send(400, { error: `${String(c.id)}: 스탯은 숫자여야 합니다.` });
              }
            }
            writeFileSync(CHARACTERS_FILE, JSON.stringify(list, null, 2) + '\n', 'utf-8');
            send(200, { ok: true, count: list.length, file: 'packages/game-data/data/characters.json' });
          } catch (error) {
            send(400, { error: error instanceof Error ? error.message : String(error) });
          }
        });
      });
    },
  };
}

// Lab(5173), 게임(5174)과 동시에 띄울 수 있도록 포트를 분리한다.
export default defineConfig({
  plugins: [react(), charactersApi()],
  server: { port: 5175 },
});
