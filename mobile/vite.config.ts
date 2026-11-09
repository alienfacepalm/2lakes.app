import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

/** Must match dev script port */
const DEV_PORT = 5173;
const host = "127.0.0.1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: ["VITE_"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host,
    port: DEV_PORT,
    strictPort: true,
    proxy: {
      "/api/kc": {
        target: "https://green2.kingcounty.gov",
        changeOrigin: true,
        rewrite: () => "/lake-buoy/GenerateMapData.aspx",
      },
    },
  },
  preview: {
    host,
    port: DEV_PORT,
    strictPort: true,
  },
});
