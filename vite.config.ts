import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs also work under a GitHub Pages repository subpath.
  base: "./",
  build: { rolldownOptions: { input: ["index.html", "compare.html"] } },
});
