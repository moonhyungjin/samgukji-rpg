import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Balance Lab(5173)과 동시에 띄울 수 있도록 포트를 분리한다.

// 장수 편집기가 data/characters.json 또는 presets.json을 저장하면 부분 갱신(HMR) 대신 페이지를 통째로 새로고침한다.
// (부분 갱신은 React 컨텍스트가 어긋나는 오류를 만들 수 있다. 새로고침하면 Lab은 새 장수 값을 자동으로 가져온다.)
const reloadOnCharacters = (): Plugin => ({
  name: 'reload-on-characters',
  handleHotUpdate({ file, server }) {
    if (file.includes('game-data') && (file.endsWith('characters.json') || file.endsWith('presets.json'))) {
      server.ws.send({ type: 'full-reload' });
      return [];
    }
  },
});

export default defineConfig({
  plugins: [react(), reloadOnCharacters()],
  server: { port: 5174 },
});
