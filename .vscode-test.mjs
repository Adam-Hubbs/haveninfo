import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  mocha: {
    ui: 'tdd',
    timeout: 20000
  },
  // This repo's absolute path is long enough that Electron's default
  // .vscode-test/user-data IPC socket path exceeds the ~103-char AF_UNIX
  // limit on macOS/Linux ("EINVAL: invalid argument ... 1.13-main.sock").
  // Point at short, OS-temp-dir paths instead.
  launchArgs: [
    '--user-data-dir=/tmp/haveninfo-vscode-test/user-data',
    '--extensions-dir=/tmp/haveninfo-vscode-test/extensions'
  ]
});