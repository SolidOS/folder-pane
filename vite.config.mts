import { solidPane, buildConfig } from "solidos-toolkit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: solidPane({
    litDecoratorPaths: ['src/components'],
    sandbox: {
      subject: "https://testingsolidos.solidcommunity.net/",
    },
  }),
  resolve: {
    tsconfigPaths: true,
  },
  build: buildConfig({ entry: "src/index.ts" })
});
