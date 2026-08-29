"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Le logo et le visuel des pages de connexion.
 *
 * Envoi en flux comme les médias : une photo d'appareil dépasse volontiers le
 * plafond des actions serveur, et le dépassement s'y solde par un écran blanc.
 *
 * L'aperçu est rechargé avec un paramètre horodaté : le fichier change de nom
 * à chaque envoi, mais l'adresse de la route ne change pas, et le navigateur
 * afficherait sinon l'ancienne image — qu'on croirait n'avoir pas su remplacer.
 */
function Champ({
  kind,
  titre,
  aide,
  present,
  apercu,
}: {
  kind: "logo" | "logo-web" | "cover";
  titre: string;
  aide: string;
  present: boolean;
  apercu: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  async function envoyer() {
    const file = inputRef.current?.files?.[0];
    if (!file) return setErreur("Choisis une image.");
    setErreur(null);
    setBusy(true);
    const r = await fetch(`/api/branding?kind=${kind}`, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-filename": encodeURIComponent(file.name),
        "x-filesize": String(file.size),
      },
      body: file,
    });
    setBusy(false);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return setErreur(body.error ?? "Envoi refusé.");
    }
    if (inputRef.current) inputRef.current.value = "";
    setVersion((v) => v + 1);
    router.refresh();
  }

  async function retirer() {
    setBusy(true);
    await fetch(`/api/branding?kind=${kind}`, { method: "DELETE" });
    setBusy(false);
    setVersion((v) => v + 1);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={
            kind === "cover"
              ? "h-[96px] w-[72px] flex-none overflow-hidden rounded-card border border-line bg-canvas"
              : // Fond sombre pour les logos : ils s'affichent sur le bandeau
                // du portail et sur le visuel de connexion, tous deux foncés.
                // Un logo blanc sur fond blanc paraîtrait manquant.
                "flex h-[64px] w-[120px] flex-none items-center justify-center overflow-hidden rounded-card border border-line bg-night"
          }
        >
          {present ? (
            /* eslint-disable-next-line @next/next/no-img-element -- servi par
               une route maison, hors du pipeline d'images. */
            <img
              src={`${apercu}?v=${version}`}
              alt={titre}
              className={kind === "cover" ? "h-full w-full object-cover" : "max-h-full max-w-full object-contain"}
            />
          ) : (
            <span className="text-micro text-ink-3">aucun</span>
          )}
        </div>

        <div className="flex min-w-[240px] flex-1 flex-col gap-2">
          <div>
            <span className="eyebrow text-ink-3">{titre}</span>
            <p className="text-small text-ink-2">{aide}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={() => setErreur(null)}
              className="min-w-0 flex-1 rounded-control border border-line bg-paper px-2 py-[5px] text-small file:mr-2 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-canvas file:px-2 file:py-[2px] file:text-micro disabled:opacity-60"
            />
            <button
              type="button"
              onClick={envoyer}
              disabled={busy}
              className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
            >
              {busy ? "Envoi…" : "Envoyer"}
            </button>
            {present ? (
              <button
                type="button"
                onClick={retirer}
                disabled={busy}
                className="flex-none cursor-pointer rounded-control border border-line bg-paper px-[10px] py-[6px] text-small text-ink-3 hover:border-alert hover:text-alert disabled:opacity-60"
              >
                Retirer
              </button>
            ) : null}
          </div>
          {erreur ? <p className="text-small text-alert">{erreur}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function ImagesDeMarque({
  logo,
  logoWeb,
  cover,
}: {
  logo: boolean;
  logoWeb: boolean;
  cover: boolean;
}) {
  return (
    <div className="flex flex-col">
      <Champ
        kind="logo"
        titre="Logo — pôle réseaux sociaux"
        aide="Signe le portail des clients qui achètent du social. Un fichier à fond transparent (PNG ou WebP) rend mieux : il s'affiche sur un bandeau foncé."
        present={logo}
        apercu="/api/branding/logo"
      />
      <Champ
        kind="logo-web"
        titre="Logo — pôle web"
        aide="Signe le portail des clients web. Laissé vide, c'est le logo ci-dessus qui sert partout — deux marques ne sont pas obligatoires."
        present={logoWeb}
        apercu="/api/branding/logo-web"
      />
      <Champ
        kind="cover"
        titre="Visuel des pages de connexion"
        aide="La colonne de droite sur un ordinateur, le fond derrière le formulaire sur un téléphone. Une photo verticale de vos réalisations vaut mieux qu'une image d'illustration. Sans visuel, un dégradé aux couleurs ci-dessus prend sa place."
        present={cover}
        apercu="/api/branding/cover"
      />
      <p className="border-t border-line pt-3 text-small text-ink-3">
        Les deux logos apparaissent côte à côte sur les écrans de connexion :
        on y ignore encore qui se connecte, et la maison porte les deux marques.
        Passé la connexion, chacun ne voit que la sienne.
      </p>
    </div>
  );
}
