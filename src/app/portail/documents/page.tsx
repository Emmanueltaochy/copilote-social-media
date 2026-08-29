import { Card } from "@/components/ui/Card";
import { formatBytes } from "@/lib/storage";
import { fichiersDuClient } from "@/db/web-queries";
import { contextePortail } from "@/lib/portail";
import { BoutonRetirer, DepotFichiers } from "../EspaceWeb";

export const dynamic = "force-dynamic";

/**
 * Les documents : ce que l'agence partage, ce que le client envoie.
 *
 * Deux listes plutôt qu'une seule mêlée. Un client qui cherche son devis ne
 * doit pas le trouver au milieu des photos qu'il nous a envoyées la semaine
 * dernière, et un client à qui l'on demande son logo doit voir tout de suite
 * s'il l'a déjà déposé.
 */
export default async function DocumentsPage() {
  const { user, client, config } = await contextePortail();
  const fichiers = await fichiersDuClient(client.id, true);

  const deLAgence = fichiers.filter((f) => f.file.uploadedById !== user.id);
  const aMoi = fichiers.filter((f) => f.file.uploadedById === user.id);

  const ligne = (
    f: (typeof fichiers)[number],
    retirable: boolean,
  ) => (
    <div
      key={f.file.id}
      className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-6"
    >
      <a
        href={`/api/client-files/${f.file.id}`}
        target="_blank"
        rel="noreferrer"
        className="clip min-w-[160px] flex-1 text-base"
      >
        {f.file.label || f.file.filename}
      </a>
      <span className="flex-none text-small text-ink-3">
        {f.file.label ? `${f.file.filename} · ` : ""}
        {formatBytes(f.file.sizeBytes)} ·{" "}
        {f.file.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
      </span>
      {retirable ? <BoutonRetirer id={f.file.id} /> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[2px]">
        <span className="eyebrow text-ink-3">{client.shortName}</span>
        <h1 className="text-display font-semibold tracking-[-0.01em]">Vos documents</h1>
      </div>

      <Card>
        <div className="border-b border-line px-4 py-5 sm:px-6">
          <span className="text-title font-semibold">Partagés par l&apos;agence</span>
          <p className="mt-1 text-base text-ink-2">
            Devis, contrats, chartes, livrables : tout ce que nous mettons à votre disposition.
          </p>
        </div>
        {deLAgence.length === 0 ? (
          <p className="px-4 py-5 text-base text-ink-2 sm:px-6">
            Rien pour l&apos;instant. Les documents que nous partagerons avec vous apparaîtront
            ici.
          </p>
        ) : (
          <div className="flex flex-col">{deLAgence.map((f) => ligne(f, false))}</div>
        )}
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-5 sm:px-6">
          <span className="text-title font-semibold">Ce que vous nous envoyez</span>
          <p className="mt-1 text-base text-ink-2">
            Logo, photos, textes, documents : déposez ici tout ce dont nous avons besoin. Vous
            pouvez retirer un fichier tant que nous ne l&apos;avons pas exploité.
          </p>
        </div>
        <DepotFichiers clientId={client.id} accent={config.primaryColor} />
        {aMoi.length > 0 ? (
          <div className="flex flex-col border-t border-line">{aMoi.map((f) => ligne(f, true))}</div>
        ) : null}
      </Card>
    </div>
  );
}
