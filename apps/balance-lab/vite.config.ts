import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// 장수 편집기가 data/characters.json을 저장하면 부분 갱신(HMR) 대신 페이지를 통째로 새로고침한다.
// (부분 갱신은 React 컨텍스트가 어긋나는 오류를 만들 수 있다. 새로고침하면 Lab은 새 장수 값을 자동으로 가져온다.)
const reloadOnCharacters = (): Plugin => ({
  name: 'reload-on-characters',
  handleHotUpdate({ file, server }) {
    if (file.includes('game-data') && file.endsWith('characters.json')) {
      server.ws.send({ type: 'full-reload' });
      return [];
    }
  },
});

export default defineConfig({
  plugins: [react(), reloadOnCharacters()],
  worker: { format: 'es' },
});
