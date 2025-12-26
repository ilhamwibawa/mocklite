import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["bin/mocklite.ts"],
  format: ["cjs"],
  clean: true,
  shims: true,
  dts: true,
});
