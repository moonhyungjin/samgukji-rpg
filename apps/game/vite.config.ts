import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Balance Lab(5173)과 동시에 띄울 수 있도록 포트를 분리한다.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
