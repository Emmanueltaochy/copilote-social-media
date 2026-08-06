import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, users } from "@/db";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";

/**
 * Définition du mot de passe par un contact client invité.
 *
 * Le jeton est à usage unique et daté : une invitation oubliée dans une
 * boîte mail ne doit pas rester une porte ouverte indéfiniment.
 */
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.inviteToken, token), gt(users.inviteExpiresAt, new Date())))
    .limit(1);
  const user = rows[0];

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-[420px] rounded-card border border-line bg-paper p-6">
          <h1 className="text-title font-semibold">Lien expiré</h1>
          <p className="mt-2 text-base text-ink-2">
            Cette invitation n&apos;est plus valable. Demandez-en une nouvelle à votre contact chez
            Taochy Consulting.
          </p>
        </div>
      </main>
    );
  }

  if (user.passwordHash) redirect("/connexion");

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2 w-2 rounded-[2px] bg-gold" />
          <span className="eyebrow text-ink">Taochy Consulting</span>
        </div>
        <h1 className="mb-1 text-display font-semibold tracking-[-0.01em]">
          Bienvenue {user.name}
        </h1>
        <p className="mb-6 text-base text-ink-2">
          Choisissez votre mot de passe pour accéder à votre espace.
        </p>
        <div className="rounded-card border border-line bg-paper p-5">
          <InviteForm token={token} />
        </div>
      </div>
    </main>
  );
}
