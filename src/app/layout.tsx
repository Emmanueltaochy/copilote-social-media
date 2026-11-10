import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { InlineScript } from "@/components/InlineScript";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * Sans cette déclaration, un téléphone rend la page à la largeur d'un écran
 * de bureau puis la réduit : tout devient illisible, y compris la version
 * terrain conçue pour lui.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a09" },
  ],
};

export const metadata: Metadata = {
  title: "Taochy Pilot",
  description:
    "Le poste de pilotage de Taochy Agency : contenus, publication, clients, campagnes et rentabilité.",
};

/*
 * Thème : « clair », « sombre » ou « système » (par défaut). Le choix vit dans
 * localStorage et s'applique avant le premier affichage par ce script en ligne,
 * pour éviter l'éclair blanc à l'ouverture en mode sombre.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("pilot-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

/**
 * Racine minimale : la coquille de l'application (navigation, en-tête)
 * vit dans le groupe (agence), pour que la connexion et l'invitation
 * s'affichent en pleine page.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={jakarta.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <InlineScript html={THEME_SCRIPT} />
      </head>
      <body>{children}</body>
    </html>
  );
}
