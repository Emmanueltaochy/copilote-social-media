import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead, Kpi, KpiGrid } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { TableHead, TableRow, TableScroll, Th } from "@/components/ui/Table";
import { Eyebrow } from "@/components/ui/primitives";
import { requireDirection } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { LIBELLE_MANDAT } from "@/lib/etape3-regles";
import { estimeCents, vueRevenu } from "@/lib/revenu";
import { LIBELLE_STATUT_PAIEMENT, ecart, nomDuMois, prochainPalier } from "@/lib/revenu-regles";
import { GraphiqueRevenu } from "./Graphique";
import { ReglagesObjectif } from "./ReglagesObjectif";
import { Simulateur } from "./Simulateur";

export const dynamic = "force-dynamic";

const euros = (c: number) => `${Math.round(c / 100).toLocaleString("fr-FR")} €`;
const signe = (c: number) => (c > 0 ? `+${euros(c)}` : c < 0 ? `−${euros(-c)}` : "0 €");
const pourcent = (x: number) => `${Math.round(x * 100)} %`;
const jour = (j: string | null) => (j ? new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");
const depuis = (d: Date | null) => {
  if (!d) return "jamais";
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  return min < 1 ? "à l'instant" : min < 60 ? `il y a ${min} min` : min < 48 * 60 ? `il y a ${Math.round(min / 60)} h` : `le ${d.toLocaleDateString("fr-FR", { timeZone: "Indian/Reunion" })}`;
};

/**
 * Le revenu mensuel récurrent : ce que les abonnements GoCardless actifs
 * prélèvent chaque mois, l'objectif et ses paliers, l'évolution sur douze
 * mois, la répartition, et ce qui fuit (échecs, mandats annulés, clients sous
 * contrat sans prélèvement).
 *
 * Réservé à la direction. Tout est lu dans ce que le relevé GoCardless a
 * gardé : la page n'appelle pas GoCardless et n'y écrit jamais rien. Tant que
 * GoCardless n'est pas relié ou pas encore relevé, elle le dit, plutôt que
 * d'afficher un zéro.
 */
export default async function RevenuPage() {
  await requireDirection();
  const maintenant = new Date();
  const v = await vueRevenu(maintenant);

  if (v.etat === "non_relie" || v.etat === "illisible") {
    return (
      <>
        <PageHeader title="Revenu mensuel" sub="Prélèvements GoCardless" />
        <EmptyState
          eyebrow="GoCardless"
          title={v.etat === "non_relie" ? "GoCardless n'est pas relié" : "Le jeton GoCardless ne peut plus être lu"}
          actionLabel="Ouvrir Réglages → GoCardless"
          actionHref="/reglages#gocardless"
        >
          <span data-revenu-etat={v.etat}>
            {v.etat === "non_relie"
              ? "Le revenu mensuel se calcule à partir des abonnements GoCardless. Reliez GoCardless avec un jeton en lecture seule dans Réglages : Pilot ne fait que lire, rien n'est jamais modifié chez GoCardless."
              : "La clé de chiffrement a changé depuis l'enregistrement du jeton. Recollez le jeton GoCardless dans Réglages pour que le revenu mensuel soit de nouveau calculé."}
          </span>
        </EmptyState>
      </>
    );
  }

  if (v.etat === "pas_encore") {
    return (
      <>
        <PageHeader title="Revenu mensuel" sub="Prélèvements GoCardless" />
        <EmptyState eyebrow="GoCardless" title="Pas encore de chiffres" actionLabel="Ouvrir Réglages → GoCardless" actionHref="/reglages#gocardless">
          <span data-revenu-etat="pas_encore">
            {v.erreur
              ? `Le dernier relevé GoCardless a échoué : ${v.erreur} `
              : v.enCours
                ? "Un relevé GoCardless est en cours : rechargez la page dans une minute. "
                : "GoCardless est relié, mais ses abonnements n'ont pas encore été relevés pour cette page. "}
            Le relevé passe toutes les 15 minutes ; vous pouvez aussi le lancer depuis Réglages → GoCardless, « Synchroniser maintenant ».
          </span>
        </EmptyState>
      </>
    );
  }

  const { reglages, actuel, evolution, parts, offres, moyenneCents, echecs, mandats, prochains, sansPrelevement } = v;
  const ht = reglages.base === "ht";
  const base = v.baseCents;
  const { resteCents } = ecart(reglages.objectifCents, base, moyenneCents);
  const prochain = prochainPalier(base, reglages);
  const ceMois = evolution.mois.at(-1)!;
  const dependances = parts.filter((p) => p.dependance);
  const totalProchains = prochains.reduce((t, p) => t + p.montantCents, 0);
  const premierMois = evolution.mois.find((m) => !m.avant);
  const moisAvant = evolution.mois.filter((m) => m.avant).length;
  const moisGraphique = evolution.mois.map((m, i) => ({
    ...m,
    court: nomDuMois(m.mois, true),
    long: nomDuMois(m.mois),
    enCours: i === evolution.mois.length - 1,
  }));
  const aRelier = parts.filter((p) => !p.relie).length;

  return (
    <>
      <PageHeader
        title="Revenu mensuel"
        sub={`Prélèvements GoCardless${v.environnement === "sandbox" ? " (sandbox, données d'essai)" : ""} · relevé ${depuis(v.dernierReleve)}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <div className="flex w-full max-w-[1100px] flex-col gap-4">
          {v.erreur ? (
            <Avis ton="warn" titre="Dernier relevé GoCardless en échec">
              {v.erreur} Les chiffres ci-dessous datent du relevé réussi précédent.
            </Avis>
          ) : null}

          {/* 1. Le chiffre et l'objectif */}
          <Card className="p-5 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-1">
                <Eyebrow>
                  Revenu mensuel <span className="normal-case">(MRR)</span>
                </Eyebrow>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[44px] leading-none font-bold tracking-[-0.03em] tabular-nums sm:text-[52px]" data-preleve-cents={actuel.preleveCents}>
                    {euros(actuel.preleveCents)}
                  </span>
                  <span className="text-base text-ink-2">prélevés chaque mois</span>
                </div>
                <p className="m-0 text-small text-ink-3">
                  Somme des {actuel.abonnements} abonnement{actuel.abonnements > 1 ? "s" : ""} GoCardless actif{actuel.abonnements > 1 ? "s" : ""}, ramenés au mois
                  (hebdomadaire × 52 / 12, annuel ÷ 12, tous les 3 mois ÷ 3…).
                </p>
                <p className="m-0 mt-2 text-base text-ink-2" data-ht-cents={actuel.horsTaxesCents}>
                  ≈ <strong className="text-ink tabular-nums">{euros(actuel.horsTaxesCents)} hors taxes</strong>{" "}
                  <span className="text-warn">
                    · estimation (TVA {String(reglages.tauxTva).replace(".", ",")} %
                    {actuel.tauxNotes ? `, ou le taux noté sur ${actuel.tauxNotes} abonnement${actuel.tauxNotes > 1 ? "s" : ""}` : ""}) : vérifiez le taux de chaque client
                  </span>
                </p>
                {actuel.ignores.length ? (
                  <p className="m-0 text-small text-warn">
                    {actuel.ignores.length} abonnement{actuel.ignores.length > 1 ? "s" : ""} actif{actuel.ignores.length > 1 ? "s" : ""} non compté{actuel.ignores.length > 1 ? "s" : ""} (autre devise
                    que l&apos;euro ou rythme inconnu) : {actuel.ignores.map((a) => `${a.nom} (${a.devise})`).join(", ")}.
                  </p>
                ) : null}

                <Progression base={base} reglages={reglages} ht={ht} />
              </div>

              <div className="flex min-w-0 flex-col justify-between gap-4 lg:border-l lg:border-line lg:pl-6">
                <div className="flex flex-col gap-1">
                  <Eyebrow>L&apos;écart à combler{ht ? " (hors taxes)" : ""}</Eyebrow>
                  <Simulateur resteCents={resteCents} moyenneCents={moyenneCents} objectifCents={reglages.objectifCents} />
                  {prochain && prochain.libelle !== "Objectif" ? (
                    <p className="m-0 mt-1 text-small text-ink-3">
                      Prochain palier : <span className="font-medium text-ink-2">{prochain.libelle}</span> à {euros(prochain.montantCents)}, encore {euros(prochain.montantCents - base)}.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-5">
              <ReglagesObjectif reglages={reglages} />
            </div>
          </Card>

          <KpiGrid columns={4}>
            <Kpi label="Clients prélevés" value={String(parts.length)} meta={`${actuel.abonnements} abonnement${actuel.abonnements > 1 ? "s" : ""} actif${actuel.abonnements > 1 ? "s" : ""}`} />
            <Kpi label="Revenu moyen par client" value={euros(moyenneCents)} meta={ht ? "hors taxes, estimé" : "prélevé par mois"} />
            <Kpi label="Nouveau ce mois-ci" value={signe(ceMois.nouveauCents)} valueTone={ceMois.nouveauCents > 0 ? "ok" : "ink"} meta="abonnements démarrés" />
            <Kpi
              label="Perdu ce mois-ci"
              value={ceMois.perduCents ? `−${euros(ceMois.perduCents)}` : "0 €"}
              valueTone={ceMois.perduCents > 0 ? "alert" : "ink"}
              meta={`net ${signe(ceMois.netCents)}`}
            />
          </KpiGrid>

          {/* 2. L'évolution sur 12 mois */}
          <Card>
            <CardHead title="Évolution sur 12 mois" meta="fin de mois, prélevé" />
            {!v.evenementsLus || evolution.finsEstimees > 0 ? (
              <div className="px-5 pb-3">
                <Avis ton="warn" titre="Historique en partie estimé" data="historique-estime">
                  {!v.evenementsLus ? "Les dates d'arrêt des abonnements n'ont pas pu être lues chez GoCardless. " : ""}
                  {evolution.finsEstimees
                    ? `${evolution.finsEstimees} abonnement${evolution.finsEstimees > 1 ? "s" : ""} arrêté${evolution.finsEstimees > 1 ? "s" : ""} sans date d'arrêt connue : la fin est placée à son dernier prélèvement connu (mois hachurés, « ≈ » dans le tableau).`
                    : ""}
                </Avis>
              </div>
            ) : null}
            {moisAvant > 0 ? (
              <p className="m-0 px-5 pb-2 text-small text-ink-3" data-historique-court>
                {premierMois
                  ? `Aucun abonnement GoCardless avant ${nomDuMois(premierMois.mois)} : ${moisAvant > 1 ? `les ${moisAvant} mois précédents n'ont pas de données, ils ne sont` : "le mois précédent n'a pas de données, il n'est"} pas à zéro.`
                  : "Aucun abonnement GoCardless sur ces 12 mois."}
              </p>
            ) : null}
            <GraphiqueRevenu mois={moisGraphique} />
            <TableScroll min={620}>
              <TableHead cols="minmax(130px,1.3fr) repeat(5, minmax(84px,1fr))">
                <Th>Mois</Th>
                <Th align="right">Fin de mois</Th>
                <Th align="right">Nouveau</Th>
                <Th align="right">Perdu</Th>
                <Th align="right">Net</Th>
                <Th align="right">Encaissé</Th>
              </TableHead>
              {[...moisGraphique].reverse().map((m) => (
                <TableRow
                  key={m.mois}
                  cols="minmax(130px,1.3fr) repeat(5, minmax(84px,1fr))"
                  height={40}
                  className={cn(m.avant && "text-ink-3")}
                >
                  <span className="text-base" data-mois={m.mois} data-fin={m.finCents} data-nouveau={m.nouveauCents} data-perdu={m.perduCents} data-net={m.netCents} data-encaisse={m.encaisseCents}>
                    {m.long}
                    {m.enCours ? <span className="text-small text-ink-3"> · en cours</span> : null}
                  </span>
                  {m.avant ? (
                    <span className="col-span-5 text-right text-small text-ink-3">pas encore d&apos;abonnement GoCardless</span>
                  ) : (
                    <>
                      <span className="text-right text-base font-medium tabular-nums">
                        {m.estime ? "≈ " : ""}
                        {euros(m.finCents)}
                      </span>
                      <span className={cn("text-right text-base tabular-nums", m.nouveauCents ? "text-ink" : "text-ink-3")}>{m.nouveauCents ? `+${euros(m.nouveauCents)}` : "—"}</span>
                      <span className={cn("text-right text-base tabular-nums", m.perduCents ? "text-ink" : "text-ink-3")}>{m.perduCents ? `−${euros(m.perduCents)}` : "—"}</span>
                      <span className={cn("text-right text-base font-medium tabular-nums", m.netCents > 0 ? "text-ok" : m.netCents < 0 ? "text-alert" : "text-ink-3")}>{signe(m.netCents)}</span>
                      <span className="text-right text-base text-ink-2 tabular-nums">{m.encaissePartiel ? "—" : euros(m.encaisseCents)}</span>
                    </>
                  )}
                </TableRow>
              ))}
            </TableScroll>
            <p className="m-0 px-5 py-3 text-small text-ink-3">
              Reconstitué à partir des dates de création et d&apos;arrêt de chaque abonnement, à son montant actuel (un montant modifié en
              cours de route n&apos;est pas retracé). « Encaissé » additionne les prélèvements d&apos;abonnements réellement passés ce
              mois-là, pour contrôle : il diffère normalement du revenu mensuel (un abonnement annuel est prélevé en une fois, un
              hebdomadaire 4 ou 5 fois). Pilot garde 13 mois de paiements GoCardless : rien n&apos;est reconstitué au-delà.
            </p>
          </Card>

          {/* 3. La répartition */}
          <div className={cn("grid gap-4", offres.montrer && "xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
            <Card>
              <CardHead title="Par client" meta={`${parts.length} client${parts.length > 1 ? "s" : ""} · moyenne ${euros(moyenneCents)}${ht ? " HT" : ""}`} />
              {dependances.length ? (
                <div className="px-5 pb-3">
                  <Avis ton="alert" titre="Risque de dépendance" data="dependance">
                    {dependances.map((d) => `${d.nom} pèse ${pourcent(d.part)}`).join(", ")} du revenu mensuel (plus de 20 %) : si{" "}
                    {dependances.length > 1 ? "l'un d'eux part" : "ce client part"}, le revenu baisse d&apos;autant.
                  </Avis>
                </div>
              ) : null}
              {parts.length === 0 ? (
                <p className="m-0 px-5 pb-5 text-base text-ink-3">Aucun abonnement GoCardless actif.</p>
              ) : (
                <ul className="m-0 list-none border-t border-line p-0">
                  {parts.map((p) => (
                    <li key={p.cle} className="flex flex-col gap-2 border-b border-line px-5 py-3" data-part-client={p.nom} data-part={p.part.toFixed(4)} data-dependance={p.dependance ? "oui" : "non"}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                          {p.lien ? (
                            <Link href={p.lien} className="clip text-base font-medium text-ink">
                              {p.nom}
                            </Link>
                          ) : (
                            <span className="clip text-base font-medium text-ink">{p.nom}</span>
                          )}
                          {!p.relie ? (
                            <Link href="/reglages#gocardless" className="text-small text-ink-3">
                              sans fiche · relier
                            </Link>
                          ) : null}
                        </span>
                        <span className="flex-none text-base tabular-nums">
                          <strong className="font-semibold">{euros(p.mensuelCents)}</strong>{" "}
                          <span className={cn("text-small", p.dependance ? "font-semibold text-alert" : "text-ink-3")}>
                            {p.dependance ? <Icon name="alert" size={12} className="mr-[2px] inline -translate-y-px" /> : null}
                            {pourcent(p.part)}
                          </span>
                        </span>
                      </div>
                      <div className="h-[6px] overflow-hidden rounded-full bg-slot" aria-hidden>
                        <div className={cn("h-full rounded-full", p.dependance ? "bg-alert" : "bg-gold")} style={{ width: `${Math.max(p.part * 100, 1)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 px-5 py-3 text-small text-ink-3">
                Montants prélevés, ramenés au mois. Un client est relié à sa fiche Contacts comme sur la fiche (e-mail, nom d&apos;entreprise
                ou lien manuel){aRelier ? ` ; ${aRelier} n'a pas encore de fiche reliée` : ""}. Au-delà de 20 % du total, un client est signalé.
              </p>
            </Card>

            {offres.montrer ? (
              <Card>
                <CardHead title="Par type d'offre" meta={`${pourcent(offres.classe)} classé`} />
                <ul className="m-0 list-none border-t border-line p-0" data-par-offre>
                  {offres.lignes.map((o) => (
                    <li key={o.offre} className="flex flex-col gap-2 border-b border-line px-5 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={cn("text-base font-medium", o.offre === "Non classé" ? "text-ink-3" : "text-ink")}>{o.offre}</span>
                        <span className="text-base tabular-nums">
                          <strong className="font-semibold">{euros(o.mensuelCents)}</strong> <span className="text-small text-ink-3">{pourcent(o.part)}</span>
                        </span>
                      </div>
                      <div className="h-[6px] overflow-hidden rounded-full bg-slot" aria-hidden>
                        <div className={cn("h-full rounded-full", o.offre === "Non classé" ? "bg-line-strong" : "bg-gold")} style={{ width: `${Math.max(o.part * 100, 1)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="m-0 px-5 py-3 text-small text-ink-3">
                  Classé par mots du nom de l&apos;abonnement (« community », « site », « maintenance », « publicité »…). Nommez vos abonnements
                  dans GoCardless pour affiner.
                </p>
              </Card>
            ) : null}
          </div>

          {/* 4. Les fuites et les risques */}
          <h2 className="m-0 mt-3 text-title font-semibold text-ink">Fuites et risques</h2>

          <Card>
            <CardHead
              title="Contrats sans prélèvement"
              meta={sansPrelevement.lignes.length ? `≈ ${euros(sansPrelevement.totalCents)} / mois` : undefined}
            />
            <p className="m-0 px-5 pb-3 text-base text-ink-2">
              Clients sous contrat dans Pilot ou facturés tous les mois chez Abby, sans abonnement GoCardless actif : les passer en prélèvement.
              Montants estimés : le forfait noté dans Pilot, sinon la moyenne des factures Abby.
            </p>
            {sansPrelevement.abby.etat !== "raccorde" ? (
              <p className="m-0 px-5 pb-3 text-small text-warn">
                {sansPrelevement.abby.etat === "erreur"
                  ? `Abby n'a pas répondu (${sansPrelevement.abby.erreur}) : seuls les contrats notés dans Pilot sont listés.`
                  : "Abby n'est pas raccordé : seuls les contrats notés dans Pilot sont listés."}
              </p>
            ) : null}
            {sansPrelevement.lignes.length === 0 ? (
              <p className="m-0 border-t border-line px-5 py-4 text-base text-ink-3">Tous les clients sous contrat ont un abonnement GoCardless actif.</p>
            ) : (
              <ul className="m-0 list-none border-t border-line p-0">
                {sansPrelevement.lignes.map((l) => (
                  <li key={l.cle} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3" data-sans-prelevement={l.nom}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-base font-medium text-ink">{l.nom}</span>
                      <span className="text-small text-ink-3">
                        {[
                          l.forfaitCents ? `forfait noté dans Pilot ${euros(l.forfaitCents)}` : l.lignesContrat ? "forfait non noté dans Pilot" : null,
                          l.lignesContrat ? `${l.lignesContrat} ligne${l.lignesContrat > 1 ? "s" : ""} de contrat` : null,
                          l.abby ? `facturé ${l.abby.moisFactures} des 4 derniers mois chez Abby (≈ ${euros(l.abby.moyenneCents)} TTC)` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-3">
                      <span className="text-right text-base font-semibold tabular-nums" data-estime={estimeCents(l)}>
                        {estimeCents(l) ? `≈ ${euros(estimeCents(l))}` : <span className="text-small font-normal text-ink-3">non noté</span>}
                      </span>
                      {l.lien ? (
                        <Link href={l.lien} className="flex min-h-9 items-center rounded-full border border-line px-3 text-small font-semibold text-ink no-underline hover:border-line-strong hover:no-underline">
                          Fiche
                        </Link>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHead title="Paiements en échec" meta="30 derniers jours" />
              {echecs.length === 0 ? (
                <p className="m-0 border-t border-line px-5 py-4 text-base text-ink-3">Aucun paiement en échec depuis 30 jours.</p>
              ) : (
                <ul className="m-0 list-none border-t border-line p-0">
                  {echecs.map((p) => (
                    <Ligne
                      key={p.id}
                      data="echec"
                      nom={p.nom}
                      lien={p.lien}
                      detail={`${LIBELLE_STATUT_PAIEMENT[p.statut] ?? p.statut} · ${jour(p.date)} · ${p.libelle}`}
                      montant={euros(p.montantCents)}
                      ton="alert"
                    />
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHead title="Mandats annulés" meta="client encore actif" />
              {mandats.length === 0 ? (
                <p className="m-0 border-t border-line px-5 py-4 text-base text-ink-3">Aucun client sous contrat sans mandat de prélèvement.</p>
              ) : (
                <ul className="m-0 list-none border-t border-line p-0">
                  {mandats.map((m) => (
                    <Ligne
                      key={m.id}
                      data="mandat"
                      nom={m.nom}
                      lien={m.lien}
                      detail={`${LIBELLE_MANDAT[m.statut] ?? m.statut}${m.annuleLe ? ` le ${jour(m.annuleLe)}` : ""} · plus rien ne peut être prélevé : faire signer un nouveau mandat`}
                      montant={m.reference ?? ""}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardHead title="Prochains prélèvements" meta={prochains.length ? `30 jours · ${euros(totalProchains)}` : "30 jours"} />
            {prochains.length === 0 ? (
              <p className="m-0 border-t border-line px-5 py-4 text-base text-ink-3">Aucun prélèvement prévu dans les 30 jours.</p>
            ) : (
              <ul className="m-0 list-none border-t border-line p-0" data-total-prochains={totalProchains}>
                {prochains.map((p) => (
                  <Ligne
                    key={`${p.abonnement ?? p.libelle}-${p.date}-${p.montantCents}`}
                    data="prochain"
                    nom={p.nom}
                    lien={p.lien}
                    detail={`${jour(p.date)} · ${p.libelle}${p.source === "echeance" ? " · échéance annoncée" : ""}`}
                    montant={euros(p.montantCents)}
                  />
                ))}
              </ul>
            )}
            <p className="m-0 px-5 py-3 text-small text-ink-3">
              Paiements déjà créés chez GoCardless et échéances annoncées des abonnements actifs, sans double compte.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Progression({ base, reglages, ht }: { base: number; reglages: { objectifCents: number; paliers: { montantCents: number; libelle: string }[] }; ht: boolean }) {
  const pct = (c: number) => Math.min(100, Math.max(0, (c / reglages.objectifCents) * 100));
  const atteint = Math.floor((base / reglages.objectifCents) * 100);
  return (
    <div className="mt-6 flex flex-col gap-3" data-progression={atteint}>
      <div className="flex items-baseline justify-between gap-3 text-small">
        <span className="font-medium text-ink-2">
          {atteint} % de l&apos;objectif{ht ? " (hors taxes)" : ""}
        </span>
        <span className="font-semibold text-ink tabular-nums">Objectif {euros(reglages.objectifCents)}</span>
      </div>
      <div className="relative pt-5">
        {reglages.paliers.map((p) => (
          <span key={p.libelle} className="absolute top-0 -translate-x-1/2 text-micro font-medium whitespace-nowrap text-ink-3 tabular-nums" style={{ left: `${pct(p.montantCents)}%` }}>
            {Math.round(p.montantCents / 100).toLocaleString("fr-FR")}
          </span>
        ))}
        <div
          className="relative h-4 rounded-full bg-slot"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.round(reglages.objectifCents / 100)}
          aria-valuenow={Math.round(base / 100)}
          aria-label="Revenu mensuel vers l'objectif"
        >
          <div className="h-full rounded-full bg-gold" style={{ width: `${pct(base)}%` }} />
          {reglages.paliers.map((p) => (
            <span key={p.libelle} className="absolute -top-1 h-6 w-[2px] -translate-x-1/2 rounded-full bg-ink" style={{ left: `${pct(p.montantCents)}%` }} aria-hidden />
          ))}
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-small">
        {reglages.paliers.map((p) => {
          const franchi = base >= p.montantCents;
          return (
            <li key={p.libelle} className="flex flex-wrap items-baseline gap-x-2" data-palier={p.libelle}>
              <span className="h-[10px] w-[2px] translate-y-px rounded-full bg-ink" aria-hidden />
              <span className="font-medium text-ink">{p.libelle}</span>
              <span className="text-ink-3 tabular-nums">{euros(p.montantCents)}</span>
              <span className={cn("tabular-nums", franchi ? "font-medium text-ok" : "text-ink-3")}>{franchi ? "· franchi" : `· encore ${euros(p.montantCents - base)}`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Avis({ ton, titre, children, data }: { ton: "warn" | "alert"; titre: string; children: ReactNode; data?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-[16px] border px-4 py-3", ton === "warn" ? "border-warn/40 bg-warn-bg" : "border-alert-line bg-alert-wash")} data-avis={data}>
      <Icon name="alert" size={16} className={cn("mt-[2px] flex-none", ton === "warn" ? "text-warn" : "text-alert")} />
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className={cn("text-base font-semibold", ton === "warn" ? "text-warn" : "text-alert")}>{titre}</span>
        <span className="text-small text-ink-2">{children}</span>
      </div>
    </div>
  );
}

function Ligne({ nom, lien, detail, montant, ton, data }: { nom: string; lien: string | null; detail: string; montant: string; ton?: "alert"; data: string }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-line px-5 py-3" data-ligne={data}>
      <span className="flex min-w-0 flex-col">
        {lien ? (
          <Link href={lien} className="clip text-base font-medium text-ink">
            {nom}
          </Link>
        ) : (
          <span className="clip text-base font-medium text-ink">{nom}</span>
        )}
        <span className="text-small text-pretty text-ink-3">{detail}</span>
      </span>
      <span className={cn("flex-none text-base font-semibold tabular-nums", ton === "alert" ? "text-alert" : "text-ink")}>{montant}</span>
    </li>
  );
}
