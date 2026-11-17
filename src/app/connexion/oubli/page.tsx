import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { currentUser } from "@/lib/auth";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Mot de passe oublié · Taochy Pilot" };

export const dynamic = "force-dynamic";

export default async function OubliPage() {
  if (await currentUser()) redirect("/");

  return (
    <AuthShell
      titre="Mot de passe oublié"
      sous="Indiquez l'adresse de votre compte : nous vous envoyons un lien pour en choisir un nouveau."
      bas={
        <>
          Votre compte et tout ce qu&apos;il contient restent intacts.{" "}
          <Link href="/connexion" className="underline">
            Retour à la connexion
          </Link>
        </>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
