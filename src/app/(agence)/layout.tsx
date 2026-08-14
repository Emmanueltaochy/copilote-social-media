import { AppProvider } from "@/state/app";
import { Sidebar } from "@/components/shell/Sidebar";
import { ChatDock } from "@/components/shell/ChatDock";
import { ClientPortal } from "@/components/shell/ClientPortal";
import { TopBar } from "@/components/shell/TopBar";
import { requireStaff } from "@/lib/auth";
import { listClientsWithPace } from "@/db/queries";
import { unreadTotal } from "@/lib/chat";
import { departmentsOf } from "@/lib/auth";
import { polActif } from "@/lib/pole";
import { countUnread, recent } from "@/lib/notify";

/**
 * La coquille de l'agence. Le contrôle d'accès est ici, au plus près du
 * rendu : c'est le seul endroit qu'une requête ne peut pas contourner.
 */
export default async function AgenceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const pole = await polActif(user);
  const [clients, notices, unreadCount, chatUnread] = await Promise.all([
    listClientsWithPace(),
    recent(user.id, 20),
    countUnread(user.id),
    unreadTotal(user.id),
  ]);

  const mobileNotices = notices.map((n) => ({
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
    >
      {/* h-dvh et non h-screen : sur mobile, la barre d'adresse du navigateur
          mange une partie de « 100vh », et le bas de l'écran — souvent la
          barre d'action — passait sous elle. La hauteur minimale ne vaut que
          sur grand écran : l'imposer à un téléphone ferait défiler la page
          entière au lieu du seul contenu. */}
      <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink lg:min-h-[720px] lg:flex-row">
        <TopBar notices={mobileNotices} unreadCount={unreadCount} />
        {/* Sur mobile la barre latérale est hors flux (elle glisse par-dessus),
            donc « main » occupe seul ce qui reste sous la barre du haut. */}
        <Sidebar notices={mobileNotices} unreadCount={unreadCount} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
          {children}
        </main>
      </div>
      <ClientPortal />
      {/* Hors du cadre à débordement caché de la coquille : une bulle fixée en
          bas à droite doit flotter au-dessus de l'écran, pas être rognée par
          la colonne qui défile. */}
      <ChatDock me={user.id} initialUnread={chatUnread} />
    </AppProvider>
  );
}
