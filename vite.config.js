import { defineConfig } from "vite";

export default defineConfig({
  base: "/cmpm-121-f25-d3/",
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
