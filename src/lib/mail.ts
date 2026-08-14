import "server-only";

import nodemailer from "nodemailer";

/**
 * Envoi de courriels.
 *
 * Les identifiants viennent de l'environnement, jamais du dépôt : un mot de
 * passe de boîte mail dans l'historique Git y reste pour toujours, y compris
 * après l'avoir changé.
 *
 * L'agence n'envoie que quelques dizaines de messages par jour, à des gens
 * qui attendent ces messages. Passer par la boîte de l'agence plutôt que par
 * un service d'envoi tiers évite un abonnement de plus, et les messages
 * partent de l'adresse que le client connaît déjà.
 */
type Boite = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

const SOCIAL: Boite = {
  host: process.env.SMTP_HOST ?? "",
  port: Number(process.env.SMTP_PORT ?? 465),
  user: process.env.SMTP_USER ?? "",
  password: process.env.SMTP_PASSWORD ?? "",
  from: process.env.SMTP_FROM || (process.env.SMTP_USER ?? ""),
};

/**
 * La boîte du pôle web.
 *
 * Une adresse d'expédition par métier : un client qui reçoit son brief de
 * « marketing@ » se demande s'il s'est trompé d'interlocuteur, et sa réponse
 * atterrit dans la mauvaise boîte. Tout ce qui n'est pas renseigné retombe sur
 * la boîte principale — configurer une seconde adresse reste facultatif.
 */
const WEB: Boite = {
  host: process.env.SMTP_WEB_HOST || SOCIAL.host,
  port: Number(process.env.SMTP_WEB_PORT ?? process.env.SMTP_PORT ?? 465),
  user: process.env.SMTP_WEB_USER || SOCIAL.user,
  password: process.env.SMTP_WEB_PASSWORD || SOCIAL.password,
  from:
    process.env.SMTP_WEB_FROM ||
    (process.env.SMTP_WEB_USER ? process.env.SMTP_WEB_USER : SOCIAL.from),
};

export type Pole = "social" | "web";

const boite = (pole: Pole): Boite => (pole === "web" ? WEB : SOCIAL);

export const mailConfigured = (pole: Pole = "social") => {
  const b = boite(pole);
  return Boolean(b.host && b.user && b.password);
};

/** Deux boîtes, donc deux connexions gardées en cache. */
const cached = new Map<Pole, nodemailer.Transporter>();

function transporter(pole: Pole): nodemailer.Transporter {
  const existant = cached.get(pole);
  if (existant) return existant;

  const b = boite(pole);
  const t = nodemailer.createTransport({
    host: b.host,
    port: b.port,
    // 465 est un port en TLS direct ; les autres commencent en clair puis
    // basculent. Se tromper des deux côtés donne une connexion qui reste
    // ouverte sans jamais répondre.
    secure: b.port === 465,
    auth: { user: b.user, pass: b.password },
  });
  cached.set(pole, t);
  return t;
}

export type MailInput = {
  to: string;
  subject: string;
  /** Corps en texte simple, écrit comme on écrirait le message à la main. */
  text: string;
  /** Lien d'action, ajouté au bas du message et repris en HTML. */
  actionUrl?: string;
  actionLabel?: string;
  /** La boîte qui expédie. « web » pour les briefs et le suivi de projet. */
  pole?: Pole;
};

/**
 * Envoie un message et rapporte ce qui s'est passé.
 *
 * Ne lève jamais : un courriel qui ne part pas ne doit pas faire échouer
 * l'action qui l'a déclenché. Valider un contenu doit rester valide même si
 * le serveur de messagerie est injoignable — mais l'échec est retourné, pour
 * être inscrit à côté de la notification plutôt que perdu.
 */
export async function sendMail(input: MailInput): Promise<{ error?: string }> {
  const pole = input.pole ?? "social";
  if (!mailConfigured(pole)) {
    return { error: "Messagerie non configurée sur le serveur." };
  }

  const lien = input.actionUrl
    ? `\n\n${input.actionLabel ?? "Ouvrir"} : ${input.actionUrl}`
    : "";

  try {
    await transporter(pole).sendMail({
      from: boite(pole).from,
      to: input.to,
      subject: input.subject,
      text: `${input.text}${lien}\n\n— Taochy Consulting`,
      html: html(input),
    });
    return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[pilot] envoi de courriel impossible", input.to, message);
    return { error: message.split("\n")[0].slice(0, 160) };
  }
}

/**
 * Un message sobre, en tableau et en styles enlignés : les clients de
 * messagerie ignorent les feuilles de style externes et la moitié des règles
 * modernes de mise en page.
 */
function html(input: MailInput): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const bouton = input.actionUrl
    ? `<p style="margin:24px 0 0"><a href="${escape(input.actionUrl)}" style="display:inline-block;background:#121212;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">${escape(input.actionLabel ?? "Ouvrir")}</a></p>`
    : "";

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F5F3EF;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E7E4DE;border-radius:8px;padding:24px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#8B8983">Taochy Consulting</p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#121212">${escape(input.subject)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#3B3A36;white-space:pre-line">${escape(input.text)}</p>
    ${bouton}
  </div>
  <p style="max-width:520px;margin:12px auto 0;font-size:12px;color:#8B8983">Message envoyé automatiquement par Taochy Pilot.</p>
</div>`;
}
