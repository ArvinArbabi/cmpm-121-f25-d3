// https://vitejs.dev/config/
export default {
  base: Deno.env.get("cmpm-121-f25-d3") || "/project",
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: "baseline-widely-available",
    outDir: "dist",
    sourcemap: true,
  },
};
