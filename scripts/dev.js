import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(process.execPath, ['scripts/compiler-server.js'], { stdio: 'inherit', env: process.env }),
  spawn(npmCommand, ['exec', 'next', '--', 'dev'], { stdio: 'inherit', env: process.env }),
];

function stop() {
  for (const child of children) child.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children[1].on('exit', (code) => {
  stop();
  process.exit(code ?? 0);
});
