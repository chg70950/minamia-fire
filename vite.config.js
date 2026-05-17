import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // 他の端末からLAN経由でアクセス可能にする
    port: 5173,
  },
});
