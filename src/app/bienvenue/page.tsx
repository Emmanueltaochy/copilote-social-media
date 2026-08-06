import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
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
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2 w-2 rounded-[2px] bg-gold" />
          <span className="eyebrow text-ink">Taochy Pilot</span>
        </div>
        <h1 className="mb-1 text-display font-semibold tracking-[-0.01em]">
          Créons ton compte
        </h1>
        <p className="mb-6 text-base text-ink-2">
          L&apos;outil est vide et cette page n&apos;apparaîtra qu&apos;une fois. Ce premier
          compte aura tous les droits, y compris la rentabilité.
        </p>

        <div className="rounded-card border border-line bg-paper p-5">
          <Suspense>
            <AuthForm
              action={createFirstUser}
              submitLabel="Créer mon compte"
              withName
              passwordHint="Au moins 10 caractères. Note-le dans ton gestionnaire de mots de passe."
            />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
