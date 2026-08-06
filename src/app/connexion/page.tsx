import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { login } from "./actions";
import { currentUser, hasAnyUser } from "@/lib/auth";

export const metadata = { title: "Connexion · Taochy Pilot" };

// Ces pages interrogent la base pour savoir s'il existe déjà un compte :
// elles ne peuvent pas être pré-rendues à la construction.
export const dynamic = "force-dynamic";

export default async function ConnexionPage() {
  // Base neuve : il n'y a personne à qui se connecter, on ouvre l'installation.
  if (!(await hasAnyUser())) redirect("/bienvenue");
  if (await currentUser()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2 w-2 rounded-[2px] bg-gold" />
          <span className="eyebrow text-ink">Taochy Pilot</span>
        </div>
        <h1 className="mb-1 text-display font-semibold tracking-[-0.01em]">Connexion</h1>
        <p className="mb-6 text-base text-ink-2">Le poste de pilotage de l&apos;agence.</p>

        <div className="rounded-card border border-line bg-paper p-5">
          <Suspense>
            <AuthForm action={login} submitLabel="Se connecter" />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
