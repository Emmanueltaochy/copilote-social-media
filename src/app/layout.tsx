import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/state/app";
import { Sidebar } from "@/components/shell/Sidebar";
import { ClientPortal } from "@/components/shell/ClientPortal";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <AppProvider>
          {/* Fixed app frame: the shell never scrolls, only the screen body does. */}
          <div className="flex h-screen min-h-[720px] overflow-hidden bg-canvas text-ink">
            <Sidebar />
            <main className="flex min-w-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
              {children}
            </main>
          </div>
          <ClientPortal />
        </AppProvider>
      </body>
    </html>
  );
}
