import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        // Service Worker tiene que poder actualizarse rapido cuando shippeamos
        // un fix. Vercel por defecto cachea archivos de /public/ con un TTL
        // largo — eso para sw.js es peligroso porque podriamos quedarnos con
        // un SW bugueado en los Sticks. `max-age=0` + `must-revalidate`
        // fuerza al navegador a revalidar contra el origen en cada carga.
        // `Service-Worker-Allowed: /` permite que el SW controle todo el sitio
        // aunque se sirva desde la raiz (es el default, pero lo explicitamos).
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ]
  },
};

export default nextConfig;
