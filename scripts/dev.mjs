import { spawn } from 'node:child_process';

const services = ['dev:api', 'dev:web'].map((script) =>
  spawn('npm', ['run', script], { stdio: 'inherit' }),
);

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const service of services) {
    if (service.exitCode === null) service.kill('SIGTERM');
  }
}

for (const service of services) {
  service.on('error', (error) => {
    console.error('Could not start a TicketFlow service:', error);
    stop(1);
  });
  service.on('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
