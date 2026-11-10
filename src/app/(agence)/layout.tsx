import { AppProvider } from "@/state/app";
import { AppShell } from "@/components/shell/AppShell";
import { ChatDock } from "@/components/shell/ChatDock";
import { ClientPortal } from "@/components/shell/ClientPortal";
import { requireStaff } from "@/lib/auth";
import { listClientsWithPace } from "@/db/queries";
import { shellCounts } from "@/db/shell-queries";
import { unreadTotal } from "@/lib/chat";
import { departmentsOf } from "@/lib/auth";
import { polActif } from "@/lib/pole";
import { countUnread, recent } from "@/lib/notify";
import { scopeClientId } from "@/lib/scope";

/**
 * La coquille de l'agence. Le contrôle d'accès est ici, au plus près du
 * rendu : c'est le seul endroit qu'une requête ne peut pas contourner.
 */
export default async function AgenceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const pole = await polActif(user);
  const [clients, notices, unreadCount, chatUnread, counts] = await Promise.all([
    listClientsWithPace(new Date(), pole),
    recent(user.id, 20),
    countUnread(user.id),
    unreadTotal(user.id),
    shellCounts(),
  ]);
  const scopeId = await scopeClientId();
  const scoped = clients.find((c) => c.id === scopeId);

  const shellNotices = notices.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    href: n.href,
    createdAt: n.createdAt,
    readAt: n.readAt,
  }));

  return (
    <AppProvider
      user={{
        name: user.name,
        role: user.role,
        initials: user.initials,
        avatar: user.avatarPath ? `/api/avatar/${user.id}` : null,
        departments: departmentsOf(user),
        pole,
      }}
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        done: c.done,
        target: c.contentTarget,
        tone: c.pace.tone,
      }))}
      initialScope={scoped?.name ?? null}
    >
      <AppShell notices={shellNotices} unreadCount={unreadCount} counts={counts}>
        {children}
      </AppShell>
      <ClientPortal />
      {/* Hors du cadre à débordement caché de la coquille : une bulle fixée en
          bas à droite doit flotter au-dessus de l'écran, pas être rognée par
          la colonne qui défile. */}
      <ChatDock me={user.id} initialUnread={chatUnread} />
    </AppProvider>
  );
}
