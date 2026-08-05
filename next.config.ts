import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Produit .next/standalone : un serveur autonome qui n'embarque que les
   * node_modules réellement utilisés. L'image Docker reste légère, donc
   * rapide à tirer sur un VPS partagé avec d'autres SaaS.
   */
  output: "standalone",
};

export default nextConfig;
