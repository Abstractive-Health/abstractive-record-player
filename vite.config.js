import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    target: "es2022",
    sourcemap: false,
    // The music catalog is its own lazily loaded chunk (~90 kB gzipped).
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.js"],
    include: ["src/**/*.test.{js,jsx}"],
    restoreMocks: true,
  },
});
