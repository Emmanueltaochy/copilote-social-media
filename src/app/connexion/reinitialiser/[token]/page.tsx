import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { userForResetToken } from "@/lib/password-reset";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "Nouveau mot de passe · Taochy Pilot" };

export const dynamic = "force-dynamic";

/**
 * Choix d'un nouveau mot de passe, depuis le lien reçu par courriel.
 *
 * Le compte est conservé tel quel : seul le mot de passe change.
 */
export default async function ReinitialiserPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await userForResetToken(token);

  if (!user) {
    return (
      <AuthShell
        titre="Lien expiré"
        sous="Ce lien de réinitialisation n'est plus valable."
        bas="Un lien sert une seule fois et pendant une heure : c'est ce qui empêche un courriel oublié de rester une porte ouverte."
      >
        <Link
          href="/connexion/oubli"
          className="block rounded-control border border-ink bg-ink px-3 py-[10px] text-center text-base font-medium text-paper hover:bg-black"
        >
          Demander un nouveau lien
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      titre="Nouveau mot de passe"
      sous={`Choisissez le nouveau mot de passe du compte ${user.email}.`}
      bas="Vous seul le connaissez : nous n'en gardons qu'une empreinte, illisible."
    >
      <ResetForm token={token} />
    </AuthShell>
  );
}
