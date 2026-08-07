import { headers } from "next/headers";
import { PageHeader } from "@/components/shell/Screen";
import { Card, CardHead } from "@/components/ui/Card";
import { Avatar, Eyebrow } from "@/components/ui/primitives";
import { InviteLink } from "@/components/ui/InviteLink";
import { SendByEmail } from "@/components/ui/SendByEmail";
import { requireDirection } from "@/lib/auth";
import { listTeam } from "@/db/queries";
import { formatDuration } from "@/lib/duration";
import { monthLabel } from "@/lib/pacing";
import { InviteForm } from "./InviteForm";
import { ACCESS_DURATIONS, ACCESS_DURATION_KEYS } from "@/data/team";
import { changeRole, renewInvite, restoreTeammate, revokeTeammate, setAccessDuration } from "./actions";

export const dynamic = "force-dynamic";

/**
 * L'équipe.
 *
 * Deux rôles seulement, parce qu'il n'y a qu'une question à trancher : qui
 * voit l'argent. La direction voit les forfaits, les coûts et les marges ;
 * l'équipe voit tout le travail — clients, production, tournages, campagnes,
 * rapports — et rien des montants.
 *
 * Réservé à la direction : donner un accès interne revient à ouvrir le
 * portefeuille clients en entier.
 */
export default async function EquipePage() {
  const me = await requireDirection();
  const team = await listTeam();

  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "";
  const scheme =
    head.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin = host ? `${scheme}://${host}` : "";

  const active = team.filter((t) => t.active);
  const pending = active.filter((t) => !t.hasPassword);
  const gone = team.filter((t) => !t.active);
  const directions = active.filter((t) => t.role === "direction").length;

  return (
    <>
      <PageHeader
        title="Équipe"
        sub={`${active.length} compte${active.length > 1 ? "s" : ""} interne${
          active.length > 1 ? "s" : ""
        }${pending.length > 0 ? ` · ${pending.length} invitation${pending.length > 1 ? "s" : ""} en attente` : ""} · ${monthLabel()}`}
      />

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <Eyebrow>Nouveau collaborateur</Eyebrow>
              <h2 className="text-title font-semibold">Inviter quelqu&apos;un</h2>
              <p className="mt-1 text-base text-ink-2">
                L&apos;invité reçoit un lien à usage unique et choisit lui-même son mot de passe :
                personne dans l&apos;agence ne le connaît, et il n&apos;y a pas de mot de passe
                provisoire à transmettre — celui qu&apos;on donne de vive voix finit toujours par
                rester en place.
              </p>
            </div>
            <InviteForm />
          </Card>

          <Card>
            <CardHead title="Comptes internes" meta={`${active.length}`} />
            {active.map((t) => {
              const isMe = t.id === me.id;
              // Retirer le dernier accès direction rendrait l'agence
              // inadministrable : le choix est verrouillé dans ce cas.
              const lockedRole = t.role === "direction" && directions === 1;

              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-3"
                >
                  <Avatar
                    initials={t.initials}
                    src={t.avatarPath ? `/api/avatar/${t.id}` : null}
                    size={28}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="clip text-base font-medium">
                      {t.name}
                      {isMe ? <span className="text-ink-3"> · vous</span> : null}
                    </span>
                    <span className="clip text-small text-ink-3">{t.email}</span>
                  </span>

                  <span className="w-[110px] flex-none text-right text-small tabular-nums text-ink-2">
                    {t.minutes > 0 ? formatDuration(t.minutes) : "—"}
                  </span>

                  <form action={changeRole} className="flex flex-none items-center gap-1">
                    <input type="hidden" name="id" value={t.id} />
                    <select
                      name="role"
                      defaultValue={t.role}
                      disabled={lockedRole}
                      className="rounded-control border border-line bg-paper px-2 py-1 text-small outline-none focus:border-gold disabled:opacity-60"
                    >
                      <option value="equipe">Équipe</option>
                      <option value="direction">Direction</option>
                    </select>
                    {!lockedRole ? (
                      <button
                        type="submit"
                        className="cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-micro font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                      >
                        OK
                      </button>
                    ) : null}
                  </form>

                  {!isMe ? (
                    <form action={revokeTeammate} className="flex-none">
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-small text-ink-3 hover:border-alert hover:text-alert"
                      >
                        Retirer
                      </button>
                    </form>
                  ) : (
                    <span className="w-[62px] flex-none" />
                  )}

                  {t.accessExpiresAt ? (
                    <div className="flex w-full flex-wrap items-center gap-2 pl-[38px]">
                      <span
                        className={`text-small ${
                          t.accessExpiresAt <= new Date() ? "text-alert" : "text-warn"
                        }`}
                      >
                        {t.accessExpiresAt <= new Date()
                          ? `Accès expiré le ${t.accessExpiresAt.toLocaleDateString("fr-FR")} — le compte ne peut plus se connecter.`
                          : `Renfort ponctuel · accès jusqu'au ${t.accessExpiresAt.toLocaleDateString("fr-FR")}`}
                      </span>
                      <form action={setAccessDuration} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={t.id} />
                        <select
                          name="duration"
                          defaultValue="semaine"
                          className="rounded-control border border-line bg-paper px-2 py-[2px] text-micro outline-none focus:border-gold"
                        >
                          {ACCESS_DURATION_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {ACCESS_DURATIONS[k].label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="cursor-pointer rounded-control border border-line bg-paper px-2 py-[2px] text-micro text-ink-2 hover:border-line-strong hover:text-ink"
                        >
                          Prolonger
                        </button>
                      </form>
                    </div>
                  ) : null}

                  {!t.hasPassword ? (
                    <div className="flex w-full items-center gap-2 pl-[38px]">
                      {t.inviteToken ? (
                        <InviteLink url={`${origin}/invitation/${t.inviteToken}`} />
                      ) : (
                        <span className="flex-1 text-small text-warn">
                          Invitation expirée ou révoquée.
                        </span>
                      )}
                      <SendByEmail kind="invitation" id={t.id} defaultTo={t.email} label="Envoyer le lien" />
                      <form action={renewInvite} className="flex-none">
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          type="submit"
                          className="cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-micro text-ink-2 hover:border-line-strong hover:text-ink"
                        >
                          Nouveau lien
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <p className="px-[14px] py-3 text-small text-ink-3">
              La colonne du milieu montre les heures saisies ce mois. Un rôle « Équipe » donne
              accès à tout le travail — clients, production, tournages, campagnes, rapports — mais
              à aucun montant : ni forfaits, ni coûts, ni marges. Une durée d&apos;accès limitée
              convient aux renforts ponctuels : elle s&apos;éteint d&apos;elle-même, sans que
              personne ait à y penser.
            </p>
          </Card>

          {gone.length > 0 ? (
            <Card>
              <CardHead title="Comptes retirés" meta={`${gone.length}`} />
              {gone.map((t) => (
                <div key={t.id} className="flex items-center gap-3 border-b border-line px-[14px] py-[10px]">
                  <span className="clip min-w-0 flex-1 text-base text-ink-2">{t.name}</span>
                  <span className="clip w-[200px] flex-none text-small text-ink-3">{t.email}</span>
                  <form action={restoreTeammate} className="flex-none">
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-control border border-line bg-paper px-2 py-1 text-small text-ink-2 hover:border-line-strong hover:text-ink"
                    >
                      Réactiver
                    </button>
                  </form>
                </div>
              ))}
              <p className="px-[14px] py-3 text-small text-ink-3">
                Un compte retiré est désactivé, pas supprimé : ses heures, ses contenus et ses
                actions restent rattachés à quelqu&apos;un. Ses sessions ouvertes sont fermées
                immédiatement.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
