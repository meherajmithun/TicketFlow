/**
 * Starts both the API server and the Vite dev server concurrently.
 * Usage: npm run dev  (from the repo root)
 *
 * The Vite server proxies /api → http://127.0.0.1:4000 so the browser
 * never makes cross-origin requests and CORS is a non-issue in dev.
 */
import { spawn } from 'node:child_process';

const services = ['dev:api', 'dev:web'].map((script) =>
  spawn('npm', ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' }),
);

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const svc of services) {
    if (svc.exitCode === null) svc.kill('SIGTERM');
  }
}

for (const svc of services) {
  svc.on('error', (err) => { console.error('Could not start service:', err); stop(1); });
  svc.on('exit', (code) => { if (!stopping) stop(code || 1); });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
