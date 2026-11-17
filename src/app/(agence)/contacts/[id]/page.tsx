import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/primitives";
import { ClientChip } from "@/components/home/bits";
import { Icon } from "@/components/ui/Icon";
import { canSeeMoney, requireStaff } from "@/lib/auth";
import { clients, contents, db, type Client, type DirectoryEntry } from "@/db";
import { facturesDuClient, listClientFiles, listContractLines } from "@/db/queries";
import { listWebProjects } from "@/db/web-queries";
import { frise, resoudreFiche, type MomentFrise } from "@/db/annuaire-queries";
import { ACTIVITES, KINDS, SOURCES, STATUTS, isStatut, jourRelatif, type Kind, type Source } from "@/lib/annuaire";
import { abbyRaccorde, chercherClientsAbby, documentsDuClient, type AbbyDoc } from "@/lib/abby";
import { aujourdhuiReunion } from "@/lib/ce-matin";
import { CONTENT_KIND, networksLabel } from "@/data/content";
import { PROJECT_TYPE, WEB_PHASE } from "@/data/web";
import { euroFromCents } from "@/lib/pacing";
import { cn } from "@/lib/cn";
import { FicheForm } from "../FicheForm";
import { majFiche, relierAbby, relierAuClient } from "../actions";

export const dynamic = "force-dynamic";

/**
 * La fiche d'un contact, façon CRM : qui c'est, ce qu'il a signé, ce qu'il a
 * payé, ce qui est en cours, ce qu'on s'est dit. Une fiche par contact : un
 * client a l'adresse de son compte, un prospect celle de sa fiche.
 */
export default async function FichePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const r = await resoudreFiche(id, user);
  if (!r) notFound();
  if (r.mode === "redirection") redirect(r.vers);

  const client: Client | null = r.mode === "client" ? r.client : null;
  const entry: DirectoryEntry | null = r.entry;
  const money = canSeeMoney(user);
  const today = aujourdhuiReunion();
  const maintenant = new Date().getTime();

  const nom = client ? client.name : entry!.name;
  const kind: Kind = client
    ? entry?.kind === "partenaire"
      ? "partenaire"
      : client.active && !client.archivedAt
        ? "client"
        : "ancien_client"
    : ((entry!.kind in KINDS ? entry!.kind : "autre") as Kind);
  const source = (entry?.source ?? "agence") as Source;
  const statut = isStatut(entry?.status) ? STATUTS[entry!.status as keyof typeof STATUTS] : null;
  const data = (entry?.data ?? {}) as Record<string, unknown>;

  const [lignesContrat, fichiers, projets, enCours, moments] = await Promise.all([
    client ? listContractLines(client.id) : Promise.resolve([]),
    client ? listClientFiles(client.id) : Promise.resolve([]),
    client ? listWebProjects(client.id) : Promise.resolve([]),
    client
      ? db
          .select({ id: contents.id, title: contents.title, status: contents.status, scheduledAt: contents.scheduledAt, kind: contents.kind })
          .from(contents)
          .where(and(eq(contents.clientId, client.id), notInArray(contents.status, ["publie", "manque"])))
          .orderBy(sql`${contents.scheduledAt} asc nulls last`)
          .limit(8)
      : Promise.resolve([]),
    frise(client?.id ?? null, entry?.id ?? null),
  ]);

  // L'argent : Abby si la fiche y est reliée, plus les factures déposées dans Pilot.
  const abbyId = client?.abbyCustomerId ?? entry?.abbyCustomerId ?? null;
  let abby: { etat: "non_raccorde" | "non_relie" | "erreur" | "ok"; docs: AbbyDoc[]; erreur?: string; candidats: { id: string; name: string; email: string }[] } = {
    etat: "non_raccorde",
    docs: [],
    candidats: [],
  };
  const facturesPilot = money && client ? await facturesDuClient(client.id) : [];
  if (money && (await abbyRaccorde())) {
    try {
      if (abbyId) abby = { etat: "ok", docs: await documentsDuClient(abbyId), candidats: [] };
      else abby = { etat: "non_relie", docs: [], candidats: await chercherClientsAbby(client?.shortName ?? nom) };
    } catch (e) {
      abby = { etat: "erreur", docs: [], erreur: (e as Error).message, candidats: [] };
    }
  }

  const prospectsLiables =
    !client && entry
      ? await db
          .select({ id: clients.id, name: clients.name })
          .from(clients)
          .where(and(eq(clients.active, true), isNotNull(clients.name)))
          .orderBy(asc(clients.name))
      : [];

  const due = entry?.nextActionOn && entry.nextActionOn <= today;

  return (
    <>
      <PageHeader title={client?.shortName ?? nom} sub={[KINDS[kind].label, SOURCES[source] ?? source, entry?.city ?? client?.sector].filter(Boolean).join(" · ")}>
        {client ? (
          <Link href={`/clients/${client.id}`} className="rounded-full border border-line bg-paper px-4 py-[9px] text-base font-medium text-ink no-underline hover:border-line-strong hover:no-underline">
            Contrat, portail et réglages
          </Link>
        ) : null}
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-1 pb-10 lg:px-7">
        <div className="flex w-full max-w-[1200px] flex-col gap-4">
          {/* En-tête : qui, comment le joindre, et la prochaine chose à faire. */}
          <Card padded className="flex flex-col gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <ClientChip name={nom} size={52} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-title leading-tight font-semibold break-words">{nom}</span>
                <div className="flex flex-wrap gap-1">
                  <StatusPill tone={KINDS[kind].tone}>{KINDS[kind].label}</StatusPill>
                  <StatusPill tone="neutral">{SOURCES[source] ?? source}</StatusPill>
                  {entry?.activity === "swapiles" ? <StatusPill tone="gold">{ACTIVITES.swapiles}</StatusPill> : null}
                  {statut ? <StatusPill tone={statut.tone}>{statut.label}</StatusPill> : null}
                  {(entry?.tags ?? []).map((t) => (
                    <StatusPill key={t} tone="muted">
                      {t}
                    </StatusPill>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-x-6 gap-y-2 text-base sm:grid-cols-2 lg:grid-cols-3">
              <Coord icone="user" valeur={entry?.contactName} vide="Interlocuteur à renseigner" />
              <Coord icone="message" valeur={entry?.email} href={entry?.email ? `mailto:${entry.email}` : undefined} vide="E-mail à renseigner" />
              <Coord icone="phone" valeur={entry?.phone} href={entry?.phone ? `tel:${entry.phone.replace(/\s/g, "")}` : undefined} vide="Téléphone à renseigner" />
              <Coord icone="monitor" valeur={entry?.website} href={entry?.website ?? undefined} externe vide="Pas de site connu" />
              <Coord icone="home" valeur={[entry?.city, entry?.country].filter(Boolean).join(", ") || null} vide="Ville à renseigner" />
              <Coord icone="layers" valeur={entry?.sector ?? client?.sector} vide="Métier à renseigner" />
              {typeof data.ficheGoogle === "string" ? (
                <Coord icone="eye" valeur={`Fiche Google Maps${typeof data.noteGoogle === "number" ? ` · ${String(data.noteGoogle).replace(".", ",")} ★ (${data.avisGoogle ?? 0} avis)` : ""}`} href={data.ficheGoogle} externe />
              ) : null}
            </div>

            <div className={cn("flex flex-col gap-1 rounded-[18px] border p-4", due ? "border-warn bg-warn-bg" : "border-line bg-canvas")}>
              <span className="eyebrow text-ink-3">Prochaine action</span>
              {entry?.nextAction ? (
                <span className="text-base text-ink">
                  {entry.nextActionOn ? <b className="font-semibold">{dateLongue(entry.nextActionOn)}{due ? " (à faire)" : ""} · </b> : null}
                  {entry.nextAction}
                </span>
              ) : (
                <span className="text-base text-ink-3">Aucune prochaine action. Ajoutez-en une dans « Modifier la fiche ».</span>
              )}
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              {/* Contrats */}
              <Card>
                <CardHead title="Contrats en cours" meta={lignesContrat.length ? `${lignesContrat.length} lignes` : undefined} />
                <div className="flex flex-col gap-2 px-5 pb-5">
                  {!client ? (
                    <p className="text-base text-ink-3">Pas de contrat : ce contact n&apos;est pas un client de l&apos;agence.</p>
                  ) : lignesContrat.length === 0 && client.monthlyFeeCents === 0 && client.webMaintenanceCents === 0 ? (
                    <p className="text-base text-ink-3">Aucun engagement mensuel enregistré sur ce compte.</p>
                  ) : (
                    <>
                      {money && (client.monthlyFeeCents > 0 || client.webMaintenanceCents > 0) ? (
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-base text-ink-2">
                          {client.monthlyFeeCents > 0 ? (
                            <span>
                              Forfait social <b className="font-semibold text-ink">{euroFromCents(client.monthlyFeeCents)} / mois</b>
                            </span>
                          ) : null}
                          {client.webMaintenanceCents > 0 ? (
                            <span>
                              Maintenance web <b className="font-semibold text-ink">{euroFromCents(client.webMaintenanceCents)} / mois</b>
                            </span>
                          ) : null}
                          {client.renewal ? <span>Renouvellement : {client.renewal}</span> : null}
                        </div>
                      ) : null}
                      {lignesContrat.map((l) => (
                        <div key={l.id} className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
                          <span className="clip min-w-0 flex-1 text-base">{l.label}</span>
                          <span className="flex-none text-small text-ink-3 max-sm:hidden">
                            {CONTENT_KIND[l.kind] ?? l.kind} · {networksLabel(l)}
                          </span>
                          <span className="flex-none text-base tabular-nums">{l.monthlyTarget} / mois</span>
                        </div>
                      ))}
                    </>
                  )}
                  {!client && entry && prospectsLiables.length ? (
                    <form action={relierAuClient} className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <input type="hidden" name="entryId" value={entry.id} />
                      <span className="text-small text-ink-3">Il a signé ?</span>
                      <select name="clientId" required aria-label="Client" className="min-w-0 flex-[1_1_180px] rounded-control border border-line bg-paper px-3 py-2 text-base text-ink">
                        <option value="">Choisir le compte client…</option>
                        {prospectsLiables.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="cursor-pointer rounded-full border border-line bg-paper px-4 py-2 text-small font-semibold text-ink hover:border-line-strong">
                        Relier au client
                      </button>
                    </form>
                  ) : null}
                </div>
              </Card>

              {/* Argent */}
              {money ? (
                <Argent abby={abby} facturesPilot={facturesPilot} clientId={client?.id ?? null} entryId={client ? null : (entry?.id ?? null)} today={today} maintenant={maintenant} />
              ) : null}

              {/* Projets et contenus */}
              <Card>
                <CardHead title="Projets web et contenus en cours" />
                <div className="flex flex-col gap-3 px-5 pb-5">
                  {!client ? (
                    <p className="text-base text-ink-3">Rien en production : ce n&apos;est pas un client de l&apos;agence.</p>
                  ) : projets.length === 0 && enCours.length === 0 ? (
                    <p className="text-base text-ink-3">Aucun projet web ni contenu en cours.</p>
                  ) : (
                    <>
                      {projets.map(({ project, jalons, jalonsFaits }) => (
                        <Link key={project.id} href={`/web/${project.id}`} className="flex min-w-0 items-center gap-3 rounded-[14px] border border-line px-3 py-2 text-ink no-underline hover:border-line-strong hover:no-underline">
                          <Icon name="monitor" size={16} className="flex-none text-ink-3" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="clip text-base font-medium">{project.name}</span>
                            <span className="clip text-small text-ink-3">
                              {PROJECT_TYPE[project.type]?.short ?? project.type} · {WEB_PHASE[project.phase]?.label}
                              {jalons ? ` · ${jalonsFaits}/${jalons} jalons` : ""}
                            </span>
                          </span>
                          {money && project.priceCents > 0 ? <span className="flex-none text-small tabular-nums text-ink-2">{euroFromCents(project.priceCents)}</span> : null}
                        </Link>
                      ))}
                      {enCours.map((c) => (
                        <Link key={c.id} href={`/contenu/${c.id}`} className="flex min-w-0 items-center gap-3 rounded-[14px] border border-line px-3 py-2 text-ink no-underline hover:border-line-strong hover:no-underline">
                          <Icon name="image" size={16} className="flex-none text-ink-3" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="clip text-base font-medium">{c.title}</span>
                            <span className="clip text-small text-ink-3">
                              {CONTENT_KIND[c.kind] ?? c.kind}
                              {c.scheduledAt ? ` · prévu le ${c.scheduledAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : " · sans date"}
                            </span>
                          </span>
                          <span className="flex-none text-small text-ink-2">{STATUT_CONTENU[c.status] ?? c.status}</span>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              </Card>

              {/* Documents */}
              <Card>
                <CardHead title="Documents" meta={fichiers.length ? `${fichiers.length}` : undefined} />
                <div className="flex flex-col px-5 pb-5">
                  {!client ? (
                    <p className="text-base text-ink-3">Les documents se rangent sur un compte client : il n&apos;y en a pas encore pour ce contact.</p>
                  ) : fichiers.length === 0 ? (
                    <p className="text-base text-ink-3">Aucun document déposé.</p>
                  ) : (
                    fichiers.slice(0, 10).map((f) => (
                      <a key={f.id} href={`/api/client-files/${f.id}`} className="flex min-w-0 items-center gap-3 border-b border-line py-2 text-ink no-underline last:border-b-0 hover:no-underline">
                        <Icon name="list" size={16} className="flex-none text-ink-3" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="clip text-base">{f.label || f.filename}</span>
                          <span className="clip text-small text-ink-3">{f.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                        </span>
                        <StatusPill tone={f.visibility === "client" ? "info" : "muted"}>{f.visibility === "client" ? "Partagé (portail)" : "Interne"}</StatusPill>
                      </a>
                    ))
                  )}
                  {client && fichiers.length > 10 ? (
                    <Link href={`/clients/${client.id}`} className="pt-2 text-small">
                      Les {fichiers.length} documents →
                    </Link>
                  ) : null}
                </div>
              </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <Frise moments={moments} />
              <ARelier />
              <Card padded>
                    <FicheForm
                      action={majFiche}
                      bouton="Enregistrer"
                      repliable="Modifier la fiche"
                      valeurs={{
                        entryId: entry?.id ?? null,
                        clientId: client?.id ?? null,
                        name: nom,
                        contactName: entry?.contactName,
                        kind,
                        source,
                        activity: entry?.activity ?? "agence",
                        status: entry?.status,
                        email: entry?.email,
                        phone: entry?.phone,
                        website: entry?.website,
                        city: entry?.city,
                        country: entry?.country,
                        sector: entry?.sector ?? client?.sector,
                        nextAction: entry?.nextAction,
                        nextActionOn: entry?.nextActionOn,
                        note: entry?.note,
                        tags: entry?.tags,
                      }}
                    />

                {entry?.note ? <p className="mt-3 border-t border-line pt-3 text-base whitespace-pre-line text-ink-2">{entry.note}</p> : null}
              </Card>
            </div>
          </div>

          <Link href="/contacts" className="text-base">
            ← Tous les contacts
          </Link>
        </div>
      </div>
    </>
  );
}

const STATUT_CONTENU: Record<string, string> = {
  idee: "Idée",
  brief: "Brief",
  tournage: "Tournage",
  derush: "Dérush",
  creation: "En création",
  revision: "Révision",
  validation: "En validation",
  pret: "Prêt",
};

const dateLongue = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function Coord({ icone, valeur, href, externe, vide }: { icone: "user" | "message" | "phone" | "monitor" | "home" | "layers" | "eye"; valeur?: string | null; href?: string; externe?: boolean; vide?: string }) {
  const contenu = valeur ? (
    href ? (
      <a href={href} target={externe ? "_blank" : undefined} rel={externe ? "noopener noreferrer" : undefined} className="clip min-w-0">
        {valeur}
      </a>
    ) : (
      <span className="clip min-w-0 text-ink">{valeur}</span>
    )
  ) : (
    <span className="clip min-w-0 text-ink-3">{vide}</span>
  );
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon name={icone} size={15} className="flex-none text-ink-3" />
      {contenu}
    </span>
  );
}

/* ---------------------------------------------------------------- argent -- */

type EtatAbby = { etat: "non_raccorde" | "non_relie" | "erreur" | "ok"; docs: AbbyDoc[]; erreur?: string; candidats: { id: string; name: string; email: string }[] };

function Argent({
  abby,
  facturesPilot,
  clientId,
  entryId,
  today,
  maintenant,
}: {
  abby: EtatAbby;
  facturesPilot: Awaited<ReturnType<typeof facturesDuClient>>;
  clientId: string | null;
  entryId: string | null;
  today: string;
  maintenant: number;
}) {
  const factures = abby.docs.filter((d) => d.type === "invoice");
  const devis = abby.docs.filter((d) => d.type === "estimate" || d.type === "purchase_order");
  const numeros = new Set(factures.map((f) => f.number));
  const pilot = facturesPilot.filter((f) => !numeros.has(f.number));

  const payees = [...factures.filter((f) => f.state === "paid").map((f) => f.amountCents), ...pilot.filter((f) => f.paidOn).map((f) => f.amountCents)];
  const ouvertes = factures.filter((f) => f.state === "finalized");
  const retardAbby = ouvertes.filter((f) => f.dueAt && f.dueAt.getTime() < maintenant);
  const pilotOuvertes = pilot.filter((f) => !f.paidOn);
  const pilotRetard = pilotOuvertes.filter((f) => f.dueOn && f.dueOn < today);
  const devisEnCours = devis.filter((d) => d.state === "finalized");
  const devisSignes = devis.filter((d) => d.state === "signed");
  const somme = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

  const encaisse = somme(payees);
  const impayes = somme([...ouvertes.map((f) => f.remainingCents ?? f.amountCents), ...pilotOuvertes.map((f) => f.amountCents)]);
  const retard = somme([...retardAbby.map((f) => f.remainingCents ?? f.amountCents), ...pilotRetard.map((f) => f.amountCents)]);
  const rienDuTout = abby.docs.length === 0 && facturesPilot.length === 0;

  return (
    <Card>
      <CardHead title="Argent" meta={abby.etat === "ok" ? "Abby + factures Pilot" : "factures Pilot"} />
      <div className="flex flex-col gap-3 px-5 pb-5">
        {abby.etat === "non_raccorde" ? (
          <p className="rounded-[14px] border border-dashed border-line-strong p-3 text-small text-ink-3">
            Abby n&apos;est pas raccordé : seules les factures déposées dans Pilot sont comptées.{" "}
            <Link href="/reglages">Raccorder Abby</Link>
          </p>
        ) : abby.etat === "erreur" ? (
          <p className="rounded-[14px] border border-dashed border-line-strong p-3 text-small text-warn">Abby n&apos;a pas répondu : {abby.erreur}</p>
        ) : abby.etat === "non_relie" ? (
          <form action={relierAbby} className="flex flex-col gap-2 rounded-[14px] border border-dashed border-line-strong p-3">
            {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
            {entryId ? <input type="hidden" name="entryId" value={entryId} /> : null}
            <span className="text-small text-ink-3">
              Ce contact n&apos;est pas encore relié à un client Abby.{" "}
              {abby.candidats.length ? "Clients Abby au nom proche :" : "Aucun client Abby ne porte un nom proche ; collez son identifiant Abby si vous le connaissez."}
            </span>
            <div className="flex flex-wrap gap-2">
              {abby.candidats.length ? (
                <select name="abbyId" required aria-label="Client Abby" className="min-w-0 flex-[1_1_200px] rounded-control border border-line bg-paper px-3 py-2 text-base text-ink">
                  {abby.candidats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.email ? ` · ${c.email}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input name="abbyId" required placeholder="Identifiant du client Abby" className="min-w-0 flex-[1_1_200px] rounded-control border border-line bg-paper px-3 py-2 text-base text-ink" />
              )}
              <button type="submit" className="cursor-pointer rounded-full border border-line bg-paper px-4 py-2 text-small font-semibold text-ink hover:border-line-strong">
                Relier à Abby
              </button>
            </div>
          </form>
        ) : null}

        {rienDuTout && abby.etat !== "ok" ? null : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Chiffre label="Encaissé" valeur={euroFromCents(encaisse)} meta={`${payees.length} facture${payees.length > 1 ? "s" : ""} payée${payees.length > 1 ? "s" : ""}`} />
            <Chiffre label="À encaisser" valeur={euroFromCents(impayes)} meta={`${ouvertes.length + pilotOuvertes.length} impayée${ouvertes.length + pilotOuvertes.length > 1 ? "s" : ""}`} ton={impayes > 0 ? "warn" : undefined} />
            <Chiffre label="En retard" valeur={euroFromCents(retard)} meta={`${retardAbby.length + pilotRetard.length} facture${retardAbby.length + pilotRetard.length > 1 ? "s" : ""}`} ton={retard > 0 ? "alert" : undefined} />
            {abby.etat === "ok" ? (
              <>
                <Chiffre label="Devis en cours" valeur={euroFromCents(somme(devisEnCours.map((d) => d.amountCents)))} meta={`${devisEnCours.length} envoyé${devisEnCours.length > 1 ? "s" : ""}, pas signé${devisEnCours.length > 1 ? "s" : ""}`} />
                <Chiffre label="Devis signés" valeur={euroFromCents(somme(devisSignes.map((d) => d.amountCents)))} meta={`${devisSignes.length} devis`} />
              </>
            ) : null}
          </div>
        )}

        {[...ouvertes, ...devisEnCours, ...devisSignes].slice(0, 6).map((d) => (
          <div key={d.id} className="flex min-w-0 items-center gap-3 border-b border-line py-2 last:border-b-0">
            <span className="clip min-w-0 flex-1 text-base">
              {d.type === "invoice" ? "Facture" : "Devis"} {d.number}
              {d.title ? <span className="text-ink-3"> · {d.title}</span> : null}
            </span>
            <span className="flex-none text-small text-ink-3">{ETAT_ABBY[d.state] ?? d.state}</span>
            <span className="flex-none text-base tabular-nums">{euroFromCents(d.amountCents)}</span>
          </div>
        ))}
        {pilotOuvertes.map((f) => (
          <div key={f.id} className="flex min-w-0 items-center gap-3 border-b border-line py-2 last:border-b-0">
            <span className="clip min-w-0 flex-1 text-base">
              Facture {f.number}
              {f.label ? <span className="text-ink-3"> · {f.label}</span> : null}
            </span>
            <span className={cn("flex-none text-small", f.dueOn && f.dueOn < today ? "text-alert" : "text-ink-3")}>{f.dueOn && f.dueOn < today ? "En retard" : "À payer"}</span>
            <span className="flex-none text-base tabular-nums">{euroFromCents(f.amountCents)}</span>
          </div>
        ))}
        {rienDuTout && abby.etat === "ok" ? <p className="text-base text-ink-3">Aucune facture ni devis pour ce client chez Abby.</p> : null}
        <p className="text-small text-ink-3">GoCardless (prélèvements) sera relié à l&apos;étape 3.</p>
      </div>
    </Card>
  );
}

const ETAT_ABBY: Record<string, string> = {
  draft: "Brouillon",
  finalized: "Envoyé",
  paid: "Payée",
  signed: "Signé",
  refused: "Refusé",
};

function Chiffre({ label, valeur, meta, ton }: { label: string; valeur: string; meta: string; ton?: "warn" | "alert" }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[16px] border border-line px-3 py-2">
      <span className="text-small text-ink-3">{label}</span>
      <span className={cn("text-title font-bold tabular-nums", ton === "alert" ? "text-alert" : ton === "warn" ? "text-warn" : "text-ink")}>{valeur}</span>
      <span className="clip text-micro text-ink-3">{meta}</span>
    </div>
  );
}

/* ----------------------------------------------------------------- frise -- */

const ORIGINE: Record<string, string> = {
  pilot: "Pilot",
  agent_ventes: "Agent ventes",
  portail: "Portail",
  gmail: "Gmail",
  trello: "Trello",
  agenda: "Agenda",
  gocardless: "GoCardless",
};

function Frise({ moments }: { moments: MomentFrise[] }) {
  const now = new Date();
  return (
    <Card>
      <CardHead title="Historique" meta={moments.length ? `${moments.length} évènement${moments.length > 1 ? "s" : ""}` : undefined} />
      <div className="px-5 pb-5">
        {moments.length === 0 ? (
          <p className="text-base text-ink-3">Rien d&apos;enregistré pour l&apos;instant.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
            {moments.map((m) => (
              <li key={m.key} className="relative">
                <span
                  className={cn(
                    "absolute top-[6px] -left-[25px] h-[9px] w-[9px] rounded-full border-2 border-paper",
                    m.genre === "email_entrant" ? "bg-alert" : m.genre === "email_sortant" ? "bg-info" : m.origine === "portail" ? "bg-warn" : "bg-line-strong",
                  )}
                />
                <div className="flex flex-wrap items-baseline gap-x-2 text-small text-ink-3">
                  <span>{m.at.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: m.at.getFullYear() === now.getFullYear() ? undefined : "numeric" })}</span>
                  <span>·</span>
                  <span>{ORIGINE[m.origine] ?? m.origine}</span>
                  {m.genre === "email_entrant" ? <StatusPill tone="alert" className="px-[7px] py-0 text-micro">E-mail reçu</StatusPill> : null}
                  {m.genre === "email_sortant" ? <StatusPill tone="info" className="px-[7px] py-0 text-micro">E-mail envoyé</StatusPill> : null}
                </div>
                <p className="text-base break-words text-ink">
                  {m.qui ? <b className="font-semibold">{m.qui.split(" ")[0]} </b> : null}
                  {m.titre}
                </p>
                {m.detail ? <p className="text-small text-ink-2">{m.detail}</p> : null}
              </li>
            ))}
          </ol>
        )}
        {moments.length ? <p className="mt-4 text-micro text-ink-3">Dernier évènement {jourRelatif(moments[0].at, now)}.</p> : null}
      </div>
    </Card>
  );
}

/* --------------------------------------------- emplacements à raccorder -- */

/**
 * Ce qui n'est pas encore relié, dit honnêtement : pas de faux e-mails, pas de
 * rendez-vous inventés — seulement ce qu'il faudra brancher.
 */
function ARelier() {
  const blocs = [
    {
      titre: "E-mails",
      etape: "Étape 2",
      texte: "Pas encore relié. Il faudra autoriser Pilot à lire la boîte Gmail (lecture seule) : les fils échangés avec ce contact s'afficheront ici, avec ceux restés sans réponse.",
    },
    {
      titre: "Actions Trello",
      etape: "Étape 3",
      texte: "Pas encore relié. Il faudra une clé Trello et le tableau (ou l'étiquette) de ce client : ses cartes ouvertes s'afficheront ici.",
    },
    {
      titre: "Rendez-vous",
      etape: "Étape 3",
      texte: "Pas encore relié. Il faudra autoriser la lecture de Google Agenda : les rendez-vous passés et à venir avec ce contact s'afficheront ici.",
    },
  ];
  return (
    <Card>
      <CardHead title="Bientôt sur cette fiche" />
      <div className="flex flex-col gap-2 px-5 pb-5">
        {blocs.map((b) => (
          <div key={b.titre} className="flex flex-col gap-1 rounded-[14px] border border-dashed border-line-strong p-3">
            <span className="flex items-center gap-2">
              <span className="text-base font-semibold text-ink">{b.titre}</span>
              <StatusPill tone="muted">{b.etape}</StatusPill>
            </span>
            <span className="text-small text-ink-3">{b.texte}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
