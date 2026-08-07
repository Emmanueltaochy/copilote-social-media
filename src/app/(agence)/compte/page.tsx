import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { requireStaff } from "@/lib/auth";
import { AvatarForm } from "./AvatarForm";
import { PasswordForm, ProfileForm } from "./Forms";

const ROLE: Record<string, string> = {
  direction: "Direction — accès complet, coûts et marges compris",
  equipe: "Équipe — production, sans les montants internes",
  client: "Client",
};

export default async function ComptePage() {
  const user = await requireStaff();

  return (
    <>
      <PageHeader title="Mon compte" sub={user.email} />

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
          <Card>
            <CardHead title="Photo de profil" />
            <div className="p-[14px]">
              <AvatarForm
                userId={user.id}
                initials={user.initials}
                hasPhoto={Boolean(user.avatarPath)}
              />
            </div>
          </Card>

          <Card>
            <CardHead title="Identité" />
            <div className="p-[14px]">
              <ProfileForm name={user.name} initials={user.initials} />
              <p className="mt-3 text-small text-ink-3">
                {ROLE[user.role]}. L&apos;adresse de connexion ({user.email}) ne se change pas
                d&apos;ici : c&apos;est elle qui reçoit les notifications, et se tromper en la
                modifiant fermerait l&apos;accès au compte.
              </p>
            </div>
          </Card>

          <Card>
            <CardHead title="Mot de passe" />
            <div className="p-[14px]">
              <PasswordForm />
              <p className="mt-3 text-small text-ink-3">
                L&apos;ancien mot de passe est demandé même connecté : sans lui, un écran resté
                ouvert suffirait à s&apos;approprier le compte.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
