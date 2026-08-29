import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, users } from "@/db";
import { AuthShell } from "@/components/AuthShell";
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
      <AuthShell
        titre="Lien expiré"
        sous="Cette invitation n'est plus valable."
        bas="Les liens d'invitation ont une durée de vie limitée : c'est ce qui empêche un courriel oublié de rester une porte ouverte."
      >
        <p className="text-base text-ink-2">
          Demandez-en une nouvelle à votre contact chez Taochy Consulting — elle arrive en
          quelques secondes.
        </p>
      </AuthShell>
    );
  }

  if (user.passwordHash) redirect("/connexion");

  return (
    <AuthShell
      titre={`Bienvenue ${user.name}`}
      sous="Choisissez votre mot de passe pour accéder à votre espace."
      bas="Vous seul le connaissez : nous n'en gardons qu'une empreinte, illisible."
    >
      <InviteForm token={token} />
    </AuthShell>
  );
}
