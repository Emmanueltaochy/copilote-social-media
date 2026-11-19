import { logout } from "@/app/connexion/actions";
import { Icon } from "@/components/ui/Icon";
import { requireVideaste } from "@/lib/auth";
import { NavVideaste } from "./Nav";

export const dynamic = "force-dynamic";

/**
 * L'espace du vidéaste.
 *
 * Un téléphone sur le terrain : ses tournages et son compte, rien d'autre.
 * La barre est en bas, à portée de pouce, comme la version terrain de
 * l'équipe. Le contrôle d'accès est refait sur chaque page et chaque action :
 * une mise en page ne protège rien.
 */
export default async function VideasteLayout({ children }: { children: React.ReactNode }) {
  const user = await requireVideaste();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-30 bg-night">
        <div className="mx-auto flex w-full max-w-[820px] items-center justify-between gap-3 px-4 py-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 flex-none rounded-[2px] bg-gold" />
            <span className="eyebrow text-white">Pilot · Vidéaste</span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="clip max-w-[140px] text-small text-night-ink">{user.name}</span>
            <form action={logout}>
              <button
                type="submit"
                aria-label="Se déconnecter"
                title="Se déconnecter"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-night-border bg-transparent text-night-ink hover:text-white"
              >
                <Icon name="logout" size={17} />
              </button>
            </form>
          </span>
        </div>
      </header>

      {/* La marge basse laisse la place à la barre du bas. */}
      <main className="mx-auto w-full max-w-[820px] flex-1 px-4 pt-4 pb-[96px]">{children}</main>

      <NavVideaste />
    </div>
  );
}
