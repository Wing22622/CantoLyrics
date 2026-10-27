import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Project site path: https://wing22622.github.io/CantoLyrics/
  base: "/CantoLyrics/",
  plugins: [react()],
});
