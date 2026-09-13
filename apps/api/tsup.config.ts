import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/worker.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ["@mwanamke/domain", "@mwanamke/security"]
});
