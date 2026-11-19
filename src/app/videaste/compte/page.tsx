import { Card, CardHead } from "@/components/ui/Card";
import { requireVideaste } from "@/lib/auth";
import { AvatarForm } from "@/app/(agence)/compte/AvatarForm";
import { PasswordForm, ProfileForm } from "@/app/(agence)/compte/Forms";

export const dynamic = "force-dynamic";

/** « Mon compte » du vidéaste : photo, nom, mot de passe. Les mêmes formulaires que l'équipe. */
export default async function CompteVideaste() {
  const user = await requireVideaste();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="eyebrow text-ink-3">{user.email}</span>
        <h1 className="text-[30px] leading-[1.05] font-bold tracking-[-0.03em]">Mon compte</h1>
      </div>
      <Card>
        <CardHead title="Photo de profil" />
        <div className="px-5 pt-1 pb-5">
          <AvatarForm userId={user.id} initials={user.initials} hasPhoto={Boolean(user.avatarPath)} />
        </div>
      </Card>
      <Card>
        <CardHead title="Identité" />
        <div className="px-5 pt-1 pb-5">
          <ProfileForm name={user.name} initials={user.initials} />
          <p className="mt-3 text-small text-ink-3">
            Vidéaste : vous voyez les tournages où l&apos;agence vous ajoute à l&apos;équipe. L&apos;adresse de connexion
            ({user.email}) se change auprès de l&apos;agence.
          </p>
        </div>
      </Card>
      <Card>
        <CardHead title="Mot de passe" />
        <div className="px-5 pt-1 pb-5">
          <PasswordForm />
        </div>
      </Card>
    </div>
  );
}
