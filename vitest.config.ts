import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/ui/test/setup.ts"],
    globals: true
  }
});
