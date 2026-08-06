import { AppProvider } from "@/state/app";
import { Sidebar } from "@/components/shell/Sidebar";
import { ClientPortal } from "@/components/shell/ClientPortal";
import { requireStaff } from "@/lib/auth";
import { listClientsWithPace } from "@/db/queries";

/**
 * La coquille de l'agence. Le contrôle d'accès est ici, au plus près du
 * rendu : c'est le seul endroit qu'une requête ne peut pas contourner.
 */
export default async function AgenceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const clients = await listClientsWithPace();

  return (
    <AppProvider
      user={{ name: user.name, role: user.role, initials: user.initials }}
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        done: c.done,
        target: c.contentTarget,
        tone: c.pace.tone,
      }))}
    >
      <div className="flex h-screen min-h-[720px] overflow-hidden bg-canvas text-ink">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
          {children}
        </main>
      </div>
      <ClientPortal />
    </AppProvider>
  );
}
