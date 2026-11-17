import Link from "next/link";
import { Card, CardHead } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { LIBELLE_MANDAT, LIBELLE_PAIEMENT, rythme } from "@/lib/etape3-regles";
import type { Etape3Fiche, RdvFiche } from "@/lib/fiche-etape3";
import { euroFromCents } from "@/lib/pacing";
import { cn } from "@/lib/cn";
import { delierCarteTrello, delierClientGoCardless, enregistrerMotsAgenda, relierCarteTrello, relierClientGoCardless } from "../etape3-actions";

/*
 * Les sections de la fiche reliées à l'étape 3 (direction seulement) :
 * « Actions Trello », « Rendez-vous », et la partie GoCardless de « Argent ».
 * Un service non relié le dit, avec un lien vers Réglages, au lieu
 * d'afficher une liste vide.
 */

type Cible = { entryId: string | null; clientId: string | null; chemin: string };

const bouton =
  "min-h-[36px] cursor-pointer rounded-full border border-line bg-paper px-3 py-1 text-small font-semibold text-ink hover:border-line-strong";
const choix = "min-w-0 flex-[1_1_200px] rounded-control border border-line bg-paper px-3 py-2 text-base text-ink";

function Cachés({ cible }: { cible: Cible }) {
  return (
    <>
      {cible.entryId ? <input type="hidden" name="entryId" value={cible.entryId} /> : null}
      {cible.clientId ? <input type="hidden" name="clientId" value={cible.clientId} /> : null}
      <input type="hidden" name="chemin" value={cible.chemin} />
    </>
  );
}

function NonRelie({ service, ancre, texte }: { service: string; ancre: string; texte: string }) {
  return (
    <p className="rounded-[14px] border border-dashed border-line-strong p-3 text-small text-ink-3" data-non-relie={ancre}>
      {service} n&apos;est pas relié : {texte} <Link href={`/reglages#${ancre}`}>Relier {service} dans Réglages</Link>
    </p>
  );
}

const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Indian/Reunion" });
const jourCourt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* ---------------------------------------------------------------- Trello -- */

export function ActionsTrello({ t, cible, maintenant }: { t: Etape3Fiche["trello"]; cible: Cible; maintenant: number }) {
  return (
    <Card>
      <div id="trello" className="scroll-mt-4" />
      <CardHead title="Actions Trello" meta={t.relie ? `${t.ouvertes.length} ouverte${t.ouvertes.length > 1 ? "s" : ""}` : undefined} />
      <div className="flex flex-col gap-2 px-5 pb-5" data-section="trello">
        {!t.relie ? (
          <NonRelie service="Trello" ancre="trello" texte="les cartes de ce client ne peuvent pas être lues." />
        ) : t.ouvertes.length === 0 ? (
          <p className="text-base text-ink-3">Aucune carte ouverte pour ce contact dans les tableaux suivis.</p>
        ) : (
          t.ouvertes.map((c) => {
            const enRetard = c.echeance && !c.echeanceFaite && Date.parse(c.echeance) < maintenant;
            return (
              <div key={c.id} className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-line p-3" data-carte-trello={c.id}>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusPill tone={c.colonneCle === "semaine" ? "warn" : c.colonneCle === "attente" ? "info" : "neutral"} className="px-[7px] py-0 text-micro">
                    {c.colonne}
                  </StatusPill>
                  {c.echeance ? (
                    <span className={cn("text-small", enRetard ? "font-semibold text-alert" : "text-ink-3")}>
                      {enRetard ? "En retard · " : "Échéance "}
                      {jour(c.echeance)}
                    </span>
                  ) : null}
                  {c.par === "manuel" ? <span className="text-micro text-ink-3">relié à la main</span> : null}
                </div>
                <span className="text-base break-words text-ink">{c.titre}</span>
                <div className="flex flex-wrap items-center gap-3">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[36px] items-center gap-1 text-small font-semibold">
                    Ouvrir dans Trello <Icon name="arrowUpRight" size={13} />
                  </a>
                  <form action={delierCarteTrello}>
                    <Cachés cible={cible} />
                    <input type="hidden" name="carte" value={c.id} />
                    <button type="submit" className="min-h-[36px] cursor-pointer text-small text-ink-3 underline-offset-4 hover:text-ink hover:underline">
                      Délier de cette fiche
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
        {t.relie && t.terminees.length ? (
          <details className="rounded-[14px] border border-line p-3 text-small text-ink-2">
            <summary className="cursor-pointer font-semibold text-ink">Dernières terminées ({t.terminees.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {t.terminees.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="break-words">
                    {c.titre}
                  </a>
                  <span className="text-micro text-ink-3">{c.activite.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Indian/Reunion" })}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {t.relie && t.aRelier.length ? (
          <form action={relierCarteTrello} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Cachés cible={cible} />
            <select name="carte" required aria-label="Carte Trello sans fiche" className={choix}>
              <option value="">Relier une carte sans fiche…</option>
              {t.aRelier.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.colonne})
                </option>
              ))}
            </select>
            <button type="submit" className={bouton}>
              Relier
            </button>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------- Rendez-vous -- */

const quand = (r: RdvFiche) => {
  const d = r.debut.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Indian/Reunion" });
  if (r.journee) return `${d} · journée entière`;
  const h = (x: Date) => x.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Reunion" });
  return `${d} · ${h(r.debut)}${r.fin ? `–${h(r.fin)}` : ""}`;
};

function Rdv({ r }: { r: RdvFiche }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-line p-3" data-rdv>
      <span className="text-small font-semibold text-ink-2">{quand(r)}</span>
      <span className="text-base font-semibold break-words text-ink">{r.titre}</span>
      {r.lieu ? <span className="text-small break-words text-ink-3">{r.lieu}</span> : null}
      {r.extrait ? <p className="text-small break-words text-ink-2">{r.extrait}</p> : null}
      <div className="flex flex-wrap gap-3">
        {r.visio ? (
          <a href={r.visio} target="_blank" rel="noopener noreferrer" className="flex min-h-[36px] items-center gap-1 text-small font-semibold">
            Rejoindre la visio <Icon name="arrowUpRight" size={13} />
          </a>
        ) : null}
        {r.lien ? (
          <a href={r.lien} target="_blank" rel="noopener noreferrer" className="flex min-h-[36px] items-center gap-1 text-small font-semibold">
            Ouvrir l&apos;événement <Icon name="arrowUpRight" size={13} />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function RendezVous({ a, cible }: { a: Etape3Fiche["agenda"]; cible: Cible }) {
  return (
    <Card>
      <div id="rendez-vous" className="scroll-mt-4" />
      <CardHead title="Rendez-vous" meta={a.relie ? `${a.prochains.length} à venir` : undefined} />
      <div className="flex flex-col gap-2 px-5 pb-5" data-section="agenda">
        {!a.relie ? (
          <NonRelie service="Google Agenda" ancre="agenda" texte="les rendez-vous avec ce contact ne peuvent pas être lus." />
        ) : (
          <>
            {a.prochains.length ? a.prochains.slice(0, 6).map((r) => <Rdv key={r.id} r={r} />) : <p className="text-base text-ink-3">Aucun rendez-vous à venir avec ce contact.</p>}
            {a.passes.length ? (
              <details className="rounded-[14px] border border-line p-3 text-small text-ink-2">
                <summary className="cursor-pointer font-semibold text-ink">Rendez-vous passés ({a.passes.length})</summary>
                <div className="mt-2 flex flex-col gap-2">
                  {a.passes.slice(0, 10).map((r) => (
                    <Rdv key={r.id} r={r} />
                  ))}
                </div>
              </details>
            ) : null}
            <form action={enregistrerMotsAgenda} className="flex flex-col gap-2 border-t border-line pt-3">
              <Cachés cible={cible} />
              <label className="flex flex-col gap-1">
                <span className="text-small text-ink-3">
                  Rattacher aussi les rendez-vous dont le titre contient (séparés par des virgules) — en plus des invités connus et du nom de la fiche :
                </span>
                <span className="flex flex-wrap gap-2">
                  <input name="mots" defaultValue={a.mots} placeholder="ex. : chantier Bellepierre" className={choix} />
                  <button type="submit" className={bouton}>
                    Enregistrer
                  </button>
                </span>
              </label>
            </form>
          </>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ GoCardless -- */

export function ArgentGoCardless({ g, cible }: { g: Etape3Fiche["gocardless"]; cible: Cible }) {
  if (!g.relie) return <NonRelie service="GoCardless" ancre="gocardless" texte="les prélèvements de ce client ne peuvent pas être lus." />;
  const echecs = g.paiements.filter((p) => p.etat === "echec");
  const aVenir = g.paiements.filter((p) => p.etat === "a_venir");
  const encaisses = g.paiements.filter((p) => p.etat === "encaisse");
  const rien = !g.mandats.length && !g.abonnements.length && !g.paiements.length;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3" data-section="gocardless">
      <span className="eyebrow text-ink-3">GoCardless (prélèvements)</span>
      {rien ? <p className="text-small text-ink-3">Aucun client GoCardless relié à cette fiche.</p> : null}
      {g.mandats.map((m) => (
        <div key={m.id} className="flex min-w-0 items-center gap-3 border-b border-line py-2 last:border-b-0" data-mandat={m.statut}>
          <span className="clip min-w-0 flex-1 text-base">Mandat {m.reference}</span>
          <StatusPill tone={m.statut === "active" ? "ok" : m.statut === "cancelled" || m.statut === "failed" ? "alert" : "neutral"} className="px-[7px] py-0 text-micro">
            {LIBELLE_MANDAT[m.statut] ?? m.statut}
          </StatusPill>
        </div>
      ))}
      {g.abonnements.map((a) => (
        <div key={a.id} className="flex min-w-0 items-center gap-3 border-b border-line py-2 last:border-b-0" data-abonnement>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="clip text-base">{a.nom}</span>
            <span className="text-micro text-ink-3">
              Abonnement {rythme(a.intervalle, a.unite)}
              {a.prochaine ? ` · prochaine échéance ${jourCourt(a.prochaine)}` : ""}
              {a.statut !== "active" ? ` · ${a.statut === "cancelled" ? "annulé" : a.statut}` : ""}
            </span>
          </span>
          <span className="flex-none text-base font-semibold tabular-nums">{euroFromCents(a.montantCents)}</span>
        </div>
      ))}
      {[...echecs, ...aVenir, ...encaisses].slice(0, 12).map((p) => (
        <div key={p.id} className="flex min-w-0 items-center gap-3 border-b border-line py-2 last:border-b-0" data-paiement={p.etat}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="clip text-base">{p.libelle}</span>
            <span className="clip text-micro text-ink-3">{p.date ? jourCourt(p.date) : ""}</span>
          </span>
          <span className={cn("flex-none text-small", p.etat === "echec" ? "font-semibold text-alert" : p.etat === "a_venir" ? "text-info" : "text-ink-3")}>
            {LIBELLE_PAIEMENT[p.statut] ?? p.statut}
          </span>
          <span className="flex-none text-base tabular-nums">{euroFromCents(p.montantCents)}</span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {g.relies.map((id) => (
          <form key={id} action={delierClientGoCardless}>
            <Cachés cible={cible} />
            <input type="hidden" name="client" value={id} />
            <button type="submit" className="min-h-[36px] cursor-pointer text-small text-ink-3 underline-offset-4 hover:text-ink hover:underline">
              Délier {g.relies.length > 1 ? `le client GoCardless ${id}` : "ce client GoCardless"}
            </button>
          </form>
        ))}
        {g.aRelier.length ? (
          <form action={relierClientGoCardless} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Cachés cible={cible} />
            <select name="client" required aria-label="Client GoCardless sans fiche" className={choix}>
              <option value="">Relier un client GoCardless sans fiche…</option>
              {g.aRelier.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
            <button type="submit" className={bouton}>
              Relier
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
