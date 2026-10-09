import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// 게임 데이터의 원본 파일들. Lab에서 "파일에 저장"하면 이 파일이 바뀌고, 게임/시뮬레이터가 이 파일을 읽는다.
const DATA_DIR = fileURLToPath(new URL('../../packages/game-data/data/', import.meta.url));
const FILES: Record<string, { file: string; kind: 'list' | 'object' }> = {
  skills: { file: 'skills.json', kind: 'list' },
  traits: { file: 'traits.json', kind: 'list' },
  unitTypes: { file: 'unitTypes.json', kind: 'list' },
  characters: { file: 'characters.json', kind: 'list' },
  presets: { file: 'presets.json', kind: 'list' },
  balance: { file: 'balance.json', kind: 'object' },
  campaign: { file: 'campaign.json', kind: 'object' },
  map: { file: 'map.json', kind: 'object' },
};

// 저장할 때마다 변경 내용을 덧붙이는 기록 파일 (내용은 Lab이 만들어 `__log`로 보낸다)
const CHANGELOG = DATA_DIR + 'changelog.md';
const CHANGELOG_HEADER = `# 데이터 변경 기록

Balance Lab의 "파일에 저장"을 누를 때마다 자동으로 덧붙는다 (가장 아래가 최신). 값이 언제 어떻게 바뀌었는지, 왜 바뀌었는지(메모)를 확인하는 용도다.
손으로 지우거나 고치지 않는다. 형식: \`경로: 이전 값 → 새 값\`, \`+ 새로 생김\`, \`- 없어짐\`.
`;

/**
 * 개발 서버에서만 동작하는 저장 API.
 * GET /api/data → 모든 데이터 파일의 내용, POST /api/data → { 파일이름: 내용 } 중 보낸 것만 파일에 쓴다.
 * 내용은 JSON(목록 또는 밸런스 객체)이고, 모양이 맞지 않으면 아무것도 쓰지 않는다.
 * `__log`(문자열)가 있으면 data/changelog.md에 덧붙인다.
 */
function dataApi(): Plugin {
  return {
    name: 'data-api',
    configureServer(server) {
      server.middlewares.use('/api/data', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        if (req.method === 'GET') {
          const all: Record<string, unknown> = {};
          for (const [name, { file }] of Object.entries(FILES)) {
            const path = DATA_DIR + file;
            if (existsSync(path)) all[name] = JSON.parse(readFileSync(path, 'utf-8'));
          }
          return send(200, all);
        }
        if (req.method !== 'POST') return send(405, { error: 'GET 또는 POST만 가능합니다.' });
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 5_000_000) req.destroy();
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body) as Record<string, unknown>;
            const log = typeof payload.__log === 'string' ? payload.__log : '';
            delete payload.__log;
            const names = Object.keys(payload);
            if (names.length === 0) return send(400, { error: '저장할 내용이 없습니다.' });
            for (const name of names) {
              const spec = FILES[name];
              if (!spec) return send(400, { error: `알 수 없는 데이터 파일입니다 (${name}).` });
              const value = payload[name];
              if (spec.kind === 'list' && (!Array.isArray(value) || value.length === 0)) return send(400, { error: `${name}: 비어 있지 않은 목록이어야 합니다.` });
              if (spec.kind === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) return send(400, { error: `${name}: 객체여야 합니다.` });
            }
            // 모두 확인한 뒤에 쓴다 (일부만 저장되는 일이 없도록)
            for (const name of names) writeFileSync(DATA_DIR + FILES[name].file, JSON.stringify(payload[name], null, 2) + '\n', 'utf-8');
            if (log.trim()) {
              if (!existsSync(CHANGELOG)) writeFileSync(CHANGELOG, CHANGELOG_HEADER, 'utf-8');
              appendFileSync(CHANGELOG, '\n' + log.trimEnd() + '\n', 'utf-8');
            }
            send(200, { ok: true, saved: names });
          } catch (error) {
            send(400, { error: error instanceof Error ? error.message : String(error) });
          }
        });
      });
    },
  };
}

// 데이터 파일이 바뀌면(Lab에서 저장했거나 git으로 받았거나) 부분 갱신(HMR) 대신 페이지를 통째로 새로고침한다.
// (부분 갱신은 React 컨텍스트가 어긋나는 오류를 만들 수 있다. 새로고침하면 Lab은 파일 값으로 다시 시작한다.)
const reloadOnData = (): Plugin => ({
  name: 'reload-on-data',
  handleHotUpdate({ file, server }) {
    if (file.includes('game-data') && file.endsWith('.json')) {
      server.ws.send({ type: 'full-reload' });
      return [];
    }
  },
});

export default defineConfig({
  plugins: [react(), dataApi(), reloadOnData()],
  worker: { format: 'es' },
  server: { port: 5173 },
});
