import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    // The existing vscode-test/Mocha integration test depends on the `vscode`
    // module, which is only resolvable inside the Extension Development
    // Host -- keep it out of vitest's plain-Node run.
    exclude: ["**/node_modules/**", "src/test/**"],
  },
});
