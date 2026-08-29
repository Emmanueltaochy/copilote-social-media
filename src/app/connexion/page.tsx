import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
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
    <AuthShell
      titre="Connexion"
      sous="Votre espace : contenus à valider, médias et projets."
      bas="Mot de passe oublié ? Écrivez à votre interlocuteur habituel, nous vous renverrons un lien."
    >
      <Suspense>
        <AuthForm action={login} submitLabel="Se connecter" />
      </Suspense>
    </AuthShell>
  );
}
