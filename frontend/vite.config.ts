import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    // Solana wallet-adapter and web3.js need Buffer + process globals
    nodePolyfills({ include: ["buffer", "process"] }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the backend running on :3000
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
