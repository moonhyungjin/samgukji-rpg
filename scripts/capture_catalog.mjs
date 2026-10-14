import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlPath = resolve('docs/art/ui-sheets/top-section-catalog.html');
const outPath = resolve('docs/art/ui-sheets/top_section_catalog_preview.png');
const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const proc = spawn(browserPath, [
  '--headless',
  '--disable-gpu',
  `--screenshot=${outPath}`,
  '--window-size=1300,1200',
  `file:///${htmlPath.replace(/\\/g, '/')}`
]);

proc.on('exit', (code) => {
  console.log('Capture exited with code', code);
});

