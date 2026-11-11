import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application : « Ajouter à l'écran d'accueil » ouvre Pilot en
 * plein écran, comme une application, avec sa propre icône. Les clients qui
 * l'installent depuis leur portail arrivent sur leur espace (la racine les y
 * renvoie).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Taochy Pilot",
    short_name: "Pilot",
    description: "Contenus, validations, publication et projets de Taochy Agency.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a09",
    theme_color: "#0a0a09",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Jarvis", url: "/jarvis", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "À valider", url: "/approbations", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
