import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Taochy Pilot",
  description:
    "Le poste de pilotage de Taochy Consulting : engagements, production, publication et rentabilité.",
};

/**
 * Racine minimale : la coquille de l'application (barre latérale, en-tête)
 * vit dans le groupe (agence), pour que la connexion et l'invitation
 * s'affichent en pleine page.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
