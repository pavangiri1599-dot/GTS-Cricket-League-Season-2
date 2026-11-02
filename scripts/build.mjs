import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, cp, rm } from 'node:fs/promises';

execFileSync(process.execPath, ['node_modules/@tailwindcss/cli/dist/index.mjs', '-i', 'src/styles.css', '-o', 'assets/styles.css', '--minify'], { stdio: 'inherit' });
// index.html is canonical; retain the original download-friendly filename.
await copyFile('index.html', 'GTS Cricket League Season 2.html');
await mkdir('dist/assets', { recursive: true });
await rm('dist/assets/live.js', { force: true });
await Promise.all([
  copyFile('index.html', 'dist/index.html'),
  copyFile('index.html', 'dist/GTS Cricket League Season 2.html'),
  cp('assets', 'dist/assets', { recursive: true }),
]);
