import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { createFirstUser } from "@/app/connexion/actions";
import { hasAnyUser } from "@/lib/auth";

export const metadata = { title: "Installation · Taochy Pilot" };

// Ces pages interrogent la base pour savoir s'il existe déjà un compte :
// elles ne peuvent pas être pré-rendues à la construction.
export const dynamic = "force-dynamic";

/**
 * Premier démarrage. Accessible uniquement tant qu'aucun compte n'existe :
 * dès que le premier administrateur est créé, la page se ferme d'elle-même.
 */
export default async function BienvenuePage() {
  if (await hasAnyUser()) redirect("/connexion");

  return (
    <AuthShell
      titre="Créons ton compte"
      sous="L'outil est vide et cette page n'apparaîtra qu'une fois. Ce premier compte aura tous les droits, y compris la rentabilité."
    >
      <Suspense>
        <AuthForm
          action={createFirstUser}
          submitLabel="Créer mon compte"
          withName
          passwordHint="Au moins 10 caractères. Note-le dans ton gestionnaire de mots de passe."
        />
      </Suspense>
    </AuthShell>
  );
}
