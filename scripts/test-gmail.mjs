#!/usr/bin/env node
//
// Gmail en lecture seule (étape 2) : vérification de bout en bout contre un
// faux serveur IMAP local (Dovecot), jamais contre un vrai compte.
//
// Ce que le script vérifie :
//   - les règles (extrait, messages automatiques, domaines publics, mots
//     d'urgence, mot de passe) ;
//   - que le code n'envoie aucune commande d'écriture (lecture du code, et
//     relevé du fil IMAP par un relais entre Pilot et Dovecot) ;
//   - que les drapeaux \Seen des messages sont identiques avant et après ;
//   - le filtrage de confidentialité (client, prospect, même domaine retenus ;
//     adresse gmail.com inconnue, lettre d'information, no-reply ignorés ;
//     rien du corps complet ni des pièces jointes dans la base) ;
//   - l'incrémental (UID mémorisés), « sans réponse », « Ce matin » avec
//     « Traité » et le retour d'une ligne quand un nouveau message arrive ;
//   - les droits (direction seulement ; autre pôle, client du portail et
//     visiteur sans session refusés) ;
//   - qu'aucun mot de passe n'apparaît dans les réponses, la base ni le journal.
//
// Usage (local uniquement) : Dovecot installé (apt-get install dovecot-imapd),
// puis un build de production lancé avec le faux serveur :
//   npm run build
//   GMAIL_IMAP_HOST=127.0.0.1 GMAIL_IMAP_PORT=11430 GMAIL_IMAP_TLS=0 MEDIA_ROOT=/tmp/pilot-media \
//     npx next start -p 3111 > /tmp/pilot-serveur.log 2>&1 &
//   BASE=http://127.0.0.1:3111 PGURL="postgres://…" JOURNAL=/tmp/pilot-serveur.log node scripts/test-gmail.mjs
//
// Le script démarre lui-même Dovecot (port 11431) et le relais (port 11430),
// et les arrête à la fin, avec le décor fictif.

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const BASE = process.env.BASE ?? "http://127.0.0.1:3111";
const PGURL = process.env.PGURL ?? process.env.DATABASE_URL;
const JOURNAL = process.env.JOURNAL ?? "";
const PORT_RELAIS = Number(process.env.IMAP_PORT ?? 11430);
const PORT_DOVECOT = PORT_RELAIS + 1;

if (!PGURL) {
  console.error("\n  ✗ PGURL (ou DATABASE_URL) est requis.\n");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(PGURL) || !/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error("\n  ✗ Ce test écrit en base : il ne tourne qu'en local.\n");
  process.exit(1);
}

/* ---------------------------------------------------------------- outils -- */

const sql = (q) => execFileSync("psql", [PGURL, "-tA", "-c", q], { encoding: "utf8" }).trim();
const un = (q) => sql(q).split("\n")[0].trim();
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

let verts = 0;
const rouges = [];
const ok = (label, condition) => {
  if (condition) {
    verts += 1;
    console.log(`OK    ${label}`);
  } else {
    rouges.push(label);
    console.log(`ÉCHEC ${label}`);
  }
};

const jeu = randomBytes(3).toString("hex");
const sha = (s) => createHash("sha256").update(s).digest("hex");
/** Tout ce que Pilot a renvoyé au navigateur, pour y chercher le mot de passe. */
const reponses = [];

/* ---------------------------------------------------- 1. règles pures -- */

console.log("\n— règles (src/lib/gmail-regles.ts) —");
const R = await import(path.join(RACINE, "src/lib/gmail-regles.ts"));
ok("gmail.com, hotmail.fr, orange.fr, outlook.be, yahoo.es : domaines grand public", ["gmail.com", "hotmail.fr", "orange.fr", "outlook.be", "yahoo.es", "wanadoo.fr", "laposte.net", "free.fr", "sfr.fr", "icloud.com", "live.fr"].every(R.estDomainePublic));
ok("garage-sud.re : domaine professionnel", !R.estDomainePublic("garage-sud.re"));
const tetes = (t) => R.lireEnTetes(t);
ok("List-Unsubscribe → automatique", R.messageAutomatique(tetes("List-Unsubscribe: <mailto:x@y.z>\n"), "a@b.c") === "List-Unsubscribe");
ok("Auto-Submitted: auto-replied → automatique ; « no » → écrit par quelqu'un", R.messageAutomatique(tetes("Auto-Submitted: auto-replied\n"), "a@b.c") && !R.messageAutomatique(tetes("Auto-Submitted: no\n"), "a@b.c"));
ok("Precedence: bulk / list → automatique", R.messageAutomatique(tetes("Precedence: bulk\n"), "a@b.c") && R.messageAutomatique(tetes("Precedence: list\n"), "a@b.c"));
ok("no-reply@, noreply@, ne-pas-repondre@ → automatique", ["no-reply@x.fr", "noreply@x.fr", "ne-pas-repondre@x.fr", "do-not-reply@x.fr", "mailer-daemon@x.fr"].every((a) => R.messageAutomatique(new Map(), a)));
ok("marie@x.fr → écrit par quelqu'un", R.messageAutomatique(new Map(), "marie@x.fr") === null);
const ex = R.extrait("Bonjour Emmanuel,\n\nVoici les photos.\n\n-- \nMarie Hoarau\nGérante\n\nLe lun. 3 nov. 2026 à 10:00, Emmanuel a écrit :\n> ancien message");
ok("extrait : sans signature ni citation", ex === "Bonjour Emmanuel, Voici les photos.");
ok("extrait : 280 caractères au plus", R.extrait("mot ".repeat(200)).length <= 280);
ok("extrait : lignes citées (« > ») retirées", R.extrait("Oui pour jeudi.\n> Le planning ?\n> Merci") === "Oui pour jeudi.");
ok("quoted-printable décodé (accents)", R.decoderPartie(Buffer.from("Probl=C3=A8me r=C3=A9gl=C3=A9"), "quoted-printable", "utf-8") === "Problème réglé");
ok("latin-1 décodé", R.decoderPartie(Buffer.from([0x65, 0x74, 0xe9]), "8bit", "iso-8859-1") === "eté");
ok("base64 tronqué décodé sans casse", R.decoderPartie(Buffer.from(Buffer.from("Bonjour à tous").toString("base64").slice(0, 14)), "base64", "utf-8").startsWith("Bonjour"));
ok("mots d'urgence : « Facture de novembre », « PROBLÈMES », « rdv »", R.motUrgent("Facture de novembre") === "facture" && R.motUrgent("Des PROBLÈMES") === "problème" && R.motUrgent("un rdv ?") === "rendez-vous");
ok("pas de faux positif : « défacturer », « devise »", R.motUrgent("defacturer la devise") === null);
ok("mot de passe « abcd efgh ijkl mnop » → 16 lettres sans espaces", R.nettoyerMotDePasse("abcd efgh ijkl mnop") === "abcdefghijklmnop" && R.nettoyerMotDePasse("trop court") === null);
const emp = (s) => sha(s);
ok(
  "fil : la réponse (References) et l'original ont la même clé",
  R.cleDeFil({ references: "<a@x>", inReplyTo: "<a@x>", messageId: "<b@x>", empreinte: emp }) === R.cleDeFil({ messageId: "<a@x>", empreinte: emp }),
);
ok("fil Gmail : X-GM-THRID pris tel quel", R.cleDeFil({ gmailThreadId: "1789", messageId: "<a@x>", empreinte: emp }) === "g:1789");
ok("domaines d'Emmanuel : swapiles.com, swapiles.re, swap-iles.re, mail.swapiles.com, taochyagency.com, world.taochyagency.com, creationsiteweb.re", ["swapiles.com", "swapiles.re", "swap-iles.re", "mail.swapiles.com", "taochyagency.com", "world.taochyagency.com", "creationsiteweb.re"].every(R.estDomaineEmmanuel));
ok("… mais pas garage-sud.re ni gmail.com", !R.estDomaineEmmanuel("garage-sud.re") && !R.estDomaineEmmanuel("gmail.com"));
ok("transactionnel : objet « [Swap Îles] … »", R.messageTransactionnel(new Map(), "contact@swapiles.com", "[Swap Îles] Remboursement à valider") === "Objet « [plateforme] »");
ok("transactionnel : X-SES-Outgoing, X-Mailgun-Sid, X-SG-EID, X-Mailin-EID, X-PM-Message-Id", ["X-SES-Outgoing: 1", "X-Mailgun-Sid: 1", "X-SG-EID: 1", "X-Mailin-EID: 1", "X-PM-Message-Id: 1"].every((h) => R.messageTransactionnel(tetes(`${h}\n`), "marie@x.fr", "Bonjour")));
ok("transactionnel : X-Mailer PHPMailer ; pas Outlook", R.messageTransactionnel(tetes("X-Mailer: PHPMailer 6.9\n"), "a@b.c", "x") && !R.messageTransactionnel(tetes("X-Mailer: Microsoft Outlook 16.0\n"), "a@b.c", "x"));
ok("transactionnel : notifications@, mailer@, bounce@", ["notifications@x.fr", "mailer@x.fr", "bounce@x.fr"].every((a) => R.messageTransactionnel(new Map(), a, "x")));
ok("un e-mail écrit par quelqu'un n'est pas transactionnel (même « Re: [Swap Îles] … »)", R.messageTransactionnel(new Map(), "marie@x.fr", "Re: [Swap Îles] commande") === null);
ok(
  "reçu rattaché par une autre adresse que From (Reply-To) : hors règles",
  R.emailHorsRegles({ sens: "recu", de: "contact@swapiles.com", a: [], cc: [], contact: "marie@x.fr", objet: "Remboursement" }) !== null,
);
ok("reçu d'un domaine d'Emmanuel : hors règles", R.emailHorsRegles({ sens: "recu", de: "contact@swapiles.com", a: [], cc: [], contact: "contact@swapiles.com", objet: "x" }) !== null);
ok("envoyé rattaché par Cci : hors règles ; par To : gardé", R.emailHorsRegles({ sens: "envoye", de: "e@gmail.com", a: ["autre@y.fr"], cc: [], contact: "marie@x.fr", objet: "x" }) !== null && R.emailHorsRegles({ sens: "envoye", de: "e@gmail.com", a: ["marie@x.fr"], cc: [], contact: "marie@x.fr", objet: "x" }) === null);
ok("reçu From = contact de la fiche : gardé", R.emailHorsRegles({ sens: "recu", de: "marie@x.fr", a: [], cc: [], contact: "marie@x.fr", objet: "Photos" }) === null);
ok("lien « Ouvrir dans Gmail »", R.lienGmail("<CAB+12@mail.gmail.com>") === "https://mail.google.com/mail/u/0/#search/rfc822msgid%3ACAB%2B12%40mail.gmail.com");

/* ------------------------------------------- 2. lecture seule : le code -- */

console.log("\n— lecture seule : le code —");
const code = ["src/lib/gmail.ts", "src/lib/gmail-regles.ts", "src/app/(agence)/reglages/gmail-actions.ts"].map((f) => readFileSync(path.join(RACINE, f), "utf8")).join("\n");
const sansCommentaires = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const interdits = [
  "messageFlagsAdd",
  "messageFlagsSet",
  "messageFlagsRemove",
  "setFlagColor",
  "messageMove",
  "messageCopy",
  "messageDelete",
  "mailboxCreate",
  "mailboxDelete",
  "mailboxRename",
  "mailboxSubscribe",
  "mailboxUnsubscribe",
  ".append(",
  ".expunge(",
];
const trouves = interdits.filter((m) => sansCommentaires.includes(m));
// Les commandes brutes passeraient par client.exec / client.run.
if (/\bclient\.(exec|run)\(/.test(sansCommentaires)) trouves.push("client.exec / client.run");
ok(`aucune méthode d'écriture d'imapflow dans le code (${interdits.length} cherchées)${trouves.length ? ` — trouvé : ${trouves.join(", ")}` : ""}`, trouves.length === 0);
ok("aucune commande brute STORE / MOVE / COPY / APPEND / EXPUNGE", !/["'`]\s*(UID\s+)?(STORE|MOVE|COPY|APPEND|EXPUNGE)\b/i.test(sansCommentaires));
const verrous = [...sansCommentaires.matchAll(/getMailboxLock\(([^)]*)\)/g)].map((m) => m[1]);
ok(`chaque ouverture de dossier est en lecture seule (${verrous.length} getMailboxLock, readOnly: true)`, verrous.length >= 2 && verrous.every((v) => /readOnly:\s*true/.test(v)));
ok("pas de mailboxOpen ni de fetch « markAsSeen »", !/mailboxOpen\(|markSeen|markAsSeen/.test(sansCommentaires));
const imports = execFileSync("grep", ["-rln", "from \"imapflow\"", path.join(RACINE, "src")], { encoding: "utf8" }).trim().split("\n");
ok("imapflow n'est importé que par src/lib/gmail.ts", imports.length === 1 && imports[0].endsWith("src/lib/gmail.ts"));

/* --------------------------------------------- 3. le faux serveur IMAP -- */

console.log(`\n— faux serveur IMAP (Dovecot) et relais (jeu ${jeu}) —`);
const compte = `emmanuel.${jeu}@gmail.com`;
const motDePasse = Array.from(randomBytes(16), (b) => String.fromCharCode(97 + (b % 26))).join("");
const motDePasseEspace = motDePasse.replace(/(.{4})(?=.)/g, "$1 ");

const dir = mkdtempSync(path.join(os.tmpdir(), "pilot-test-gmail-"));
chmodSync(dir, 0o755);
const boite = path.join(dir, "mail", compte, "Maildir");
const DOSSIERS = { inbox: boite, sent: path.join(boite, ".[Gmail].Sent Mail") };
for (const d of Object.values(DOSSIERS)) for (const s of ["cur", "new", "tmp"]) mkdirSync(path.join(d, s), { recursive: true });
writeFileSync(path.join(DOSSIERS.sent, "maildirfolder"), "");
writeFileSync(path.join(dir, "passwd"), `${compte}:{PLAIN}${motDePasse}::::::\n`);
chmodSync(path.join(dir, "passwd"), 0o644);
writeFileSync(
  path.join(dir, "dovecot.conf"),
  `base_dir = ${dir}/run
state_dir = ${dir}/state
log_path = ${dir}/dovecot.log
protocols = imap
listen = 127.0.0.1
ssl = no
disable_plaintext_auth = no
auth_mechanisms = plain login
mail_location = maildir:${dir}/mail/%u/Maildir
first_valid_uid = 500
passdb {
  driver = passwd-file
  args = scheme=PLAIN username_format=%u ${dir}/passwd
}
userdb {
  driver = static
  args = uid=65534 gid=65534 home=${dir}/mail/%u
}
namespace inbox {
  inbox = yes
  separator = /
  mailbox "[Gmail]/Sent Mail" {
    special_use = \\Sent
    auto = subscribe
  }
}
service imap-login {
  inet_listener imap {
    address = 127.0.0.1
    port = ${PORT_DOVECOT}
  }
  inet_listener imaps {
    port = 0
  }
}
`,
);

/* Les messages fictifs. */
const JOUR = 86_400_000;
let numero = 0;
const enc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
const ids = {};
function deposer(dossier, { cle, de, a, cc, objet, ilYa, reponseA, entetes = "", texte, html, pj, vu = true }) {
  numero += 1;
  const date = new Date(Date.now() - ilYa);
  const id = `<${cle}.${jeu}@test.local>`;
  ids[cle] = id;
  const refs = reponseA ? [ids[reponseA]] : [];
  const tete = [
    `Date: ${date.toUTCString().replace("GMT", "+0000")}`,
    `From: ${de}`,
    `To: ${a}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${enc(objet)}`,
    `Message-ID: ${id}`,
    refs.length ? `In-Reply-To: ${refs[0]}` : null,
    refs.length ? `References: ${refs.join(" ")}` : null,
    "MIME-Version: 1.0",
    entetes || null,
  ].filter(Boolean);
  let corps;
  if (pj) {
    const b = `b-${jeu}-${numero}`;
    corps = [
      `Content-Type: multipart/mixed; boundary="${b}"`,
      "",
      `--${b}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      Buffer.from(texte).toString("latin1").replace(/[\x80-\xff=]/g, (c) => `=${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`),
      ...pj.flatMap((p) => [
        `--${b}`,
        `Content-Type: ${p.type}; name="${p.nom}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${p.nom}"`,
        "",
        Buffer.from(p.contenu).toString("base64"),
      ]),
      `--${b}--`,
      "",
    ].join("\r\n");
  } else if (html) {
    corps = ["Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", Buffer.from(html).toString("base64"), ""].join("\r\n");
  } else {
    corps = ["Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", texte, ""].join("\r\n");
  }
  const fichier = path.join(DOSSIERS[dossier], "cur", `${Math.floor(date.getTime() / 1000)}.M${numero}P${process.pid}.pilottest:2,${vu ? "S" : ""}`);
  writeFileSync(fichier, `${tete.join("\r\n")}\r\n${corps}`);
  utimesSync(fichier, date, date);
  execFileSync("chown", ["-R", "65534:65534", path.join(dir, "mail")]);
  return id;
}

const EM = `Emmanuel <${compte}>`;
const MARIE = `marie@garage-${jeu}.test`;
const PROSPECT = `prospect.${jeu}@gmail.com`;
const CABINET_FICHE = `accueil@cabinet-${jeu}.test`;
const CABINET_AUTRE = `directeur@cabinet-${jeu}.test`;
const INCONNU = `inconnu.${jeu}@gmail.com`;
const SECRET_CORPS = `PASSAGE-JAMAIS-STOCKE-${jeu}`;
const SECRET_PJ = `CONTENU-PIECE-JOINTE-${jeu}`;
const OBJET_INCONNU = `Objet privé inconnu ${jeu}`;
const OBJET_NEWS = `Lettre d'information ${jeu}`;

// Client sous contrat : un fil répondu, un fil sans réponse avec pièces jointes.
deposer("inbox", { cle: "planning", de: `Marie Hoarau <${MARIE}>`, a: EM, objet: `Question sur le planning ${jeu}`, ilYa: 3 * JOUR, texte: "Bonjour, on décale la séance ?", vu: true });
deposer("sent", { cle: "planning-rep", de: EM, a: `Marie Hoarau <${MARIE}>`, objet: `Re: Question sur le planning ${jeu}`, ilYa: 2 * JOUR, reponseA: "planning", texte: "Oui, jeudi 10 h.\n\nLe 14 nov. Marie a écrit :\n> on décale ?" });
deposer("inbox", {
  cle: "photos",
  de: `Marie Hoarau <${MARIE}>`,
  a: EM,
  objet: `Photos pour le site ${jeu}`,
  ilYa: 2 * JOUR,
  texte: `Bonjour Emmanuel,\n\nVoici les photos de l'atelier et le logo. Dites-moi si ça va pour la page d'accueil.\n\n-- \nMarie Hoarau\nGarage Sud\n\n${SECRET_CORPS}`,
  pj: [
    { nom: "atelier.jpg", type: "image/jpeg", contenu: `${SECRET_PJ} image` },
    { nom: "logo-garage.pdf", type: "application/pdf", contenu: `${SECRET_PJ} pdf` },
  ],
  vu: false,
});
// Prospect connu (adresse gmail.com exacte) : Emmanuel a écrit, le prospect a répondu il y a 3 h.
deposer("sent", { cle: "propo", de: EM, a: PROSPECT, objet: `Proposition ${jeu}`, ilYa: 5 * JOUR, texte: "Voici notre proposition." });
deposer("inbox", { cle: "propo-rep", de: `Alex <${PROSPECT}>`, a: EM, objet: `Re: Proposition ${jeu}`, ilYa: 3 * 3_600_000, reponseA: "propo", texte: "Merci, je regarde avec mon associé.", vu: false });
// Même domaine professionnel qu'une fiche (adresse différente), en HTML, avec un mot d'urgence.
deposer("inbox", {
  cle: "cabinet",
  de: `Paul Técher <${CABINET_AUTRE}>`,
  a: EM,
  objet: `Rendez-vous jeudi ? ${jeu}`,
  ilYa: 1 * JOUR,
  html: "<html><head><style>p{color:red}</style></head><body><p>Bonjour,</p><p>Pouvons-nous caler un <b>rendez-vous</b> jeudi&nbsp;?</p></body></html>",
});
// À ignorer : adresse gmail.com inconnue, lettre d'information d'un domaine connu, no-reply, réponse automatique.
deposer("inbox", { cle: "inconnu", de: `Quelqu'un <${INCONNU}>`, a: EM, objet: OBJET_INCONNU, ilYa: 1 * JOUR, texte: `Message privé ${SECRET_CORPS}`, vu: false });
deposer("inbox", { cle: "news", de: `Garage Sud <news@garage-${jeu}.test>`, a: EM, objet: OBJET_NEWS, ilYa: 1 * JOUR, entetes: "List-Unsubscribe: <mailto:stop@garage.test>", texte: "Promos du mois", vu: false });
deposer("inbox", { cle: "noreply", de: `Cabinet <no-reply@cabinet-${jeu}.test>`, a: EM, objet: `Notification ${jeu}`, ilYa: 1 * JOUR, texte: "Votre accès", vu: true });
deposer("inbox", { cle: "absence", de: `Marie Hoarau <${MARIE}>`, a: EM, objet: `Absence ${jeu}`, ilYa: 1 * JOUR, entetes: "Auto-Submitted: auto-replied", texte: "Je suis absente", vu: true });
// Notification de la marketplace d'Emmanuel : Reply-To et Cc = l'adresse du client, l'adresse du client et « paiement » dans le corps.
const OBJET_SWAP = `[Swap Îles] Remboursement à valider (vendeur non expédié) ${jeu}`;
deposer("inbox", { cle: "swapnotif", de: `${enc("Swap Îles")} <contact@swapiles.com>`, a: EM, cc: MARIE, objet: OBJET_SWAP, ilYa: 1 * JOUR, entetes: `Reply-To: ${MARIE}`, texte: `Le vendeur ${MARIE} n'a pas expédié : paiement à rembourser.`, vu: true });
// Même plateforme, sans « [ ] » dans l'objet : le domaine swapiles.com suffit (une adresse swapiles.com est pourtant notée sur le client).
const OBJET_SWAP2 = `Remboursement à valider ${jeu}`;
deposer("inbox", { cle: "swapdomaine", de: `${enc("Swap Îles")} <ventes@swapiles.com>`, a: EM, objet: OBJET_SWAP2, ilYa: 1 * JOUR, entetes: `Reply-To: ${MARIE}`, texte: "Paiement en attente.", vu: true });
// Message transactionnel envoyé depuis le domaine du client par un service d'envoi (Amazon SES).
const OBJET_SES = `Votre commande est confirmée ${jeu}`;
deposer("inbox", { cle: "ses", de: `Garage Sud <commandes@garage-${jeu}.test>`, a: EM, objet: OBJET_SES, ilYa: 1 * JOUR, entetes: "X-SES-Outgoing: 2026.11.17-54.240.0.1", texte: "Merci pour votre commande.", vu: true });
// Un second prospect écrit ; Emmanuel lui répond depuis l'admin du site (From contact@taochyagency.com,
// PHPMailer, lien de désinscription) : l'envoi est dans « Messages envoyés » et compte comme le sien.
const PROSPECT2 = `prospect2.${jeu}@gmail.com`;
deposer("inbox", { cle: "tarif", de: `Léa <${PROSPECT2}>`, a: EM, objet: `Question tarif ${jeu}`, ilYa: 2 * JOUR, texte: "Bonjour, quel est votre tarif ?", vu: true });
deposer("sent", {
  cle: "tarif-admin",
  de: "Taochy Agency <contact@taochyagency.com>",
  a: `Léa <${PROSPECT2}>`,
  objet: `Re: Question tarif ${jeu}`,
  ilYa: 1 * JOUR,
  reponseA: "tarif",
  entetes: "X-Mailer: PHPMailer 6.9.1\r\nList-Unsubscribe: <mailto:stop@taochyagency.com>",
  texte: "Bonjour Léa, voici nos tarifs.",
});
// Hors fenêtre : un message du client vieux de 70 jours (le premier passage ne remonte qu'à 60 jours).
deposer("inbox", { cle: "vieux", de: `Marie Hoarau <${MARIE}>`, a: EM, objet: `Très ancien ${jeu}`, ilYa: 70 * JOUR, texte: "Vieux message", vu: true });

/** Les drapeaux de chaque message, lus dans les noms de fichiers Maildir (indépendants d'IMAP). */
function drapeaux() {
  const out = {};
  for (const [nom, d] of Object.entries(DOSSIERS)) {
    for (const s of ["cur", "new"]) {
      for (const f of readdirSync(path.join(d, s))) {
        const [base, fl] = f.split(":2,");
        out[`${nom}/${base.split(",")[0]}`] = `${s}:${fl ?? ""}`;
      }
    }
  }
  return out;
}

// Le relais : il note chaque ligne envoyée par Pilot à Dovecot.
const fil = [];
let connexions = 0;
const relais = net.createServer((client) => {
  connexions += 1;
  const amont = net.connect(PORT_DOVECOT, "127.0.0.1");
  let tampon = "";
  client.on("data", (d) => {
    tampon += d.toString("latin1");
    const lignes = tampon.split("\r\n");
    tampon = lignes.pop();
    fil.push(...lignes);
    amont.write(d);
  });
  amont.on("data", (d) => client.write(d));
  const fermer = () => {
    client.destroy();
    amont.destroy();
  };
  client.on("error", fermer);
  amont.on("error", fermer);
  client.on("close", fermer);
  amont.on("close", fermer);
});

const dovecot = spawn("dovecot", ["-F", "-c", path.join(dir, "dovecot.conf")], { stdio: ["ignore", "pipe", "pipe"] });
let sortieDovecot = "";
dovecot.stdout.on("data", (d) => (sortieDovecot += d));
dovecot.stderr.on("data", (d) => (sortieDovecot += d));
await new Promise((r) => relais.listen(PORT_RELAIS, "127.0.0.1", r));
for (let i = 0; i < 50; i++) {
  const pret = await new Promise((r) => {
    const s = net.connect(PORT_DOVECOT, "127.0.0.1", () => {
      s.destroy();
      r(true);
    });
    s.on("error", () => r(false));
  });
  if (pret) break;
  await attendre(100);
}
const avant = drapeaux();
ok(`Dovecot démarré, ${Object.keys(avant).length} messages déposés (boîte de réception et « [Gmail]/Sent Mail »)`, Object.keys(avant).length === 16);

/* ------------------------------------------------- 4. décor dans Pilot -- */

const ouvrirSession = (userId) => {
  const jeton = randomBytes(32).toString("base64url");
  un(`insert into sessions (token_hash, user_id, expires_at) values ('${sha(jeton)}','${userId}', now() + interval '1 day') returning token_hash`);
  return jeton;
};
const direction = un(`insert into users (email,name,initials,role) values ('dir-${jeu}@exemple.test','Direction ${jeu}','DT','direction') returning id`);
const sociale = un(`insert into users (email,name,initials,role,departments) values ('soc-${jeu}@exemple.test','Sociale ${jeu}','SO','equipe','["social"]'::jsonb) returning id`);
const web = un(`insert into users (email,name,initials,role,departments) values ('web-${jeu}@exemple.test','Web ${jeu}','WE','equipe','["web"]'::jsonb) returning id`);
const client = un(`insert into clients (name, short_name, departments) values ('Garage Sud ${jeu}','Garage Sud ${jeu}','["social"]'::jsonb) returning id`);
// Une adresse swapiles.com notée sur le client (sa boutique sur la marketplace) : elle ne doit jamais rien relier.
un(`insert into contacts (client_id, name, reach) values ('${client}', 'Marie Hoarau', '${MARIE} · boutique vendeur.${jeu}@swapiles.com') returning id`);
const portail = un(`insert into users (email,name,initials,role,client_id) values ('portail-${jeu}@exemple.test','Client ${jeu}','CP','client','${client}') returning id`);
un(`insert into directory_entries (name, contact_name, kind, source, status, email, email_key) values ('Boulangerie ${jeu}', 'Alex', 'prospect', 'agent_ventes_reunion', 'contacte', '${PROSPECT}', '${PROSPECT}') returning id`);
const ficheTarif = un(`insert into directory_entries (name, kind, source, email, email_key) values ('Pâtisserie ${jeu}', 'prospect', 'agent_ventes_reunion', '${PROSPECT2}', '${PROSPECT2}') returning id`);
// La même réponse, notée aussi par l'agent ventes dans son historique (importé de prospects.json).
un(`insert into directory_events (entry_id, source, kind, external_id, occurred_at, title) values ('${ficheTarif}', 'agent_ventes', 'email_sortant', 'h:tarif-${jeu}', date_trunc('day', now() - interval '1 day') + interval '8 hours', 'E-mail envoyé par Emmanuel : « Re: Question tarif ${jeu} »') returning id`);
const cabinet = un(`insert into directory_entries (name, kind, source, email, email_key) values ('Cabinet ${jeu}', 'prospect', 'agence', '${CABINET_FICHE}', '${CABINET_FICHE}') returning id`);
const cDir = ouvrirSession(direction);
const cSoc = ouvrirSession(sociale);
const cWeb = ouvrirSession(web);
const cPortail = ouvrirSession(portail);

/* Pages et server actions, appelées comme le navigateur. */
const page = async (chemin, cookie) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: cookie ? { Cookie: `pilot_session=${cookie}` } : {}, redirect: "manual", cache: "no-store" });
  const html = (await r.text()).replace(/<!--.*?-->/g, "");
  reponses.push(html);
  return { statut: r.status, location: r.headers.get("location") ?? "", html, visible: html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/&nbsp;|&#xa0;|\u00a0/gi, " ") };
};

function actionsDe(manifestePage, fichier) {
  const m = [`.next/server/app/${manifestePage}/server-reference-manifest.json`].map((f) => path.join(RACINE, f)).find(existsSync);
  if (!m) throw new Error(`Manifeste introuvable pour ${manifestePage} : lancer npm run build.`);
  const j = JSON.parse(readFileSync(m, "utf8"));
  return Object.fromEntries(Object.entries(j.node).filter(([, v]) => String(v.filename ?? "").includes(fichier)).map(([id, v]) => [v.exportedName, id]));
}
const A_GMAIL = actionsDe("(agence)/reglages/page", "gmail-actions");
const A_MATIN = actionsDe("(agence)/page", "ce-matin-actions");

async function action(chemin, id, args, cookie) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: "POST",
    headers: {
      "Next-Action": id,
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "text/x-component",
      Origin: BASE,
      ...(cookie ? { Cookie: `pilot_session=${cookie}` } : {}),
    },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  const texte = await r.text();
  reponses.push(texte);
  const ligne = texte.split("\n").find((l) => l.startsWith("1:"));
  try {
    return { statut: r.status, resultat: ligne ? JSON.parse(ligne.slice(2)) : null };
  } catch {
    return { statut: r.status, resultat: null };
  }
}
const gmail = (nom, arg, cookie) => action("/reglages", A_GMAIL[nom], arg === undefined ? [] : [arg], cookie);
const matin = (nom, cles, cookie) => action("/", A_MATIN[nom], [cles], cookie);

const evts = (filtre = "") => sql(`select e.title from directory_events e join directory_entries d on d.id = e.entry_id where e.source = 'gmail' and e.title like '%${jeu}%' ${filtre} order by e.title`).split("\n").filter(Boolean);
const filDe = (objet) => un(`select meta->>'fil' from directory_events where source='gmail' and title = '${objet.replace(/'/g, "''")}' limit 1`);
const attendreReleve = async (apres) => {
  for (let i = 0; i < 120; i++) {
    const s = un(`select coalesce(extract(epoch from last_success_at)::bigint, 0) from gmail_sync where id='compte'`);
    const lease = un(`select coalesce(lease_until > now(), false) from gmail_sync where id='compte'`);
    if (Number(s || 0) > apres && lease !== "t") return true;
    await attendre(500);
  }
  return false;
};
const maintenantS = () => Math.floor(Date.now() / 1000) - 1;

let codeSortie = 0;
try {
  console.log("\n— Réglages : tester et enregistrer —");
  ok("actions Gmail présentes dans le build", Boolean(A_GMAIL.testerEtEnregistrerGmail && A_GMAIL.synchroniserGmailMaintenant && A_GMAIL.deconnecterGmailAction));
  let p = await page("/reglages", cDir);
  ok("la direction voit la carte « Gmail (lecture seule) », non reliée", p.statut === 200 && p.visible.includes("Gmail (lecture seule)") && p.visible.includes("Non relié"));

  let r = await gmail("testerEtEnregistrerGmail", { adresse: compte, motDePasse: "zzzz zzzz zzzz zzzz" }, cDir);
  ok(`mauvais mot de passe : erreur claire en français (« ${r.resultat?.erreur?.slice(0, 60)}… »)`, r.resultat?.ok === false && /refusé l'adresse ou le mot de passe/.test(r.resultat.erreur));
  ok("… et rien d'enregistré", un(`select count(*) from integrations where id='gmail'`) === "0");
  r = await gmail("testerEtEnregistrerGmail", { adresse: compte, motDePasse: "mon-mot-de-passe-habituel" }, cDir);
  ok("mot de passe qui n'a pas la forme d'un mot de passe d'application : refusé avant toute connexion", r.resultat?.ok === false && /16 lettres/.test(r.resultat.erreur));
  r = await gmail("testerEtEnregistrerGmail", { adresse: "pas-une-adresse", motDePasse }, cDir);
  ok("adresse invalide : refusée", r.resultat?.ok === false && /adresse Gmail complète/.test(r.resultat.erreur));

  const debut = maintenantS();
  const connexionsAvant = connexions;
  r = await gmail("testerEtEnregistrerGmail", { adresse: compte, motDePasse: motDePasseEspace }, cDir);
  ok(`bon mot de passe (avec espaces) : « ${r.resultat?.message?.slice(0, 70)}… »`, r.resultat?.ok === true && /lecture seule/.test(r.resultat.message));
  const jeton = un(`select token from integrations where id='gmail'`);
  ok("mot de passe enregistré chiffré (v1:…), jamais en clair dans la base", jeton.startsWith("v1:") && !jeton.includes(motDePasse));
  ok("adresse enregistrée", un(`select account_id from integrations where id='gmail'`) === compte);
  ok("premier relevé lancé et terminé en arrière-plan", await attendreReleve(debut));
  ok("le test s'est connecté en lecture seule (EXAMINE INBOX)", fil.some((l) => /^\S+ EXAMINE "?INBOX"?/i.test(l)) && connexions > connexionsAvant);

  console.log("\n— confidentialité —");
  const retenus = evts();
  ok(`client : fil répondu et fil « Photos » retenus`, retenus.includes(`Question sur le planning ${jeu}`) && retenus.includes(`Re: Question sur le planning ${jeu}`) && retenus.includes(`Photos pour le site ${jeu}`));
  ok("prospect connu (adresse gmail.com exacte) retenu, envoyé et reçu", retenus.includes(`Proposition ${jeu}`) && retenus.includes(`Re: Proposition ${jeu}`));
  ok("même domaine professionnel qu'une fiche retenu (autre adresse du cabinet)", retenus.includes(`Rendez-vous jeudi ? ${jeu}`));
  ok("adresse gmail.com inconnue ignorée (le domaine gmail.com ne relie à personne)", !retenus.includes(OBJET_INCONNU));
  ok("lettre d'information (List-Unsubscribe) d'un domaine connu ignorée", !retenus.includes(OBJET_NEWS));
  ok("expéditeur no-reply ignoré", !retenus.includes(`Notification ${jeu}`));
  ok("réponse automatique (Auto-Submitted) ignorée", !retenus.includes(`Absence ${jeu}`));
  ok("message de plus de 60 jours non relevé au premier passage", !retenus.includes(`Très ancien ${jeu}`));
  ok("notification « [Swap Îles] Remboursement à valider » (Reply-To et Cc = le client) ignorée", !retenus.includes(OBJET_SWAP));
  ok("message d'un domaine swapiles.com sans « [ ] » ignoré, malgré l'adresse swapiles.com notée sur le client", !retenus.includes(OBJET_SWAP2));
  ok("message transactionnel (X-SES-Outgoing) du domaine du client ignoré", !retenus.includes(OBJET_SES));
  ok(`exactement 8 messages gardés (${retenus.length})`, retenus.length === 8);
  const tarif = JSON.parse(un(`select json_build_object('kind', kind, 'entry', entry_id, 'contact', meta->>'contact')::text from directory_events where source = 'gmail' and title = 'Re: Question tarif ${jeu}'`) || "{}");
  ok("envoi parti de l'admin (From contact@taochyagency.com, PHPMailer) : gardé comme envoyé, rattaché au prospect par To", tarif.kind === "email_sortant" && tarif.entry === ficheTarif && tarif.contact === PROSPECT2);
  ok("le client sans fiche a reçu une fiche (frise)", un(`select count(*) from directory_entries where client_id='${client}'`) === "1");
  const photos = JSON.parse(un(`select json_build_object('body', body, 'meta', meta, 'kind', kind)::text from directory_events where title='Photos pour le site ${jeu}'`));
  ok(`extrait sans signature, ≤ 280 caractères : « ${photos.body} »`, photos.body.startsWith("Bonjour Emmanuel, Voici les photos") && photos.body.length <= 280 && !photos.body.includes("Marie Hoarau"));
  ok("pièces jointes : nombre et noms seulement", photos.meta.pj.n === 2 && photos.meta.pj.noms.join(",") === "atelier.jpg,logo-garage.pdf");
  ok("lien « Ouvrir dans Gmail » par Message-ID", photos.meta.lien === `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(`photos.${jeu}@test.local`)}`);
  ok("sens, expéditeur, destinataires, Message-ID, fil", photos.kind === "email_entrant" && photos.meta.de.email === MARIE && photos.meta.a[0].email === compte && photos.meta.messageId === `photos.${jeu}@test.local` && photos.meta.fil.startsWith("m:"));
  const cab = un(`select body from directory_events where title='Rendez-vous jeudi ? ${jeu}'`);
  ok(`HTML seul : extrait en texte brut (« ${cab} »)`, cab === "Bonjour, Pouvons-nous caler un rendez-vous jeudi ?");
  const dump = execFileSync("pg_dump", ["--data-only", PGURL], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  ok("la base ne contient ni le corps complet, ni le contenu des pièces jointes", !dump.includes(SECRET_CORPS) && !dump.includes(SECRET_PJ) && !dump.includes(Buffer.from(`${SECRET_PJ} pdf`).toString("base64")));
  ok("ni l'objet ni l'adresse des messages ignorés", !dump.includes(OBJET_INCONNU) && !dump.includes(INCONNU) && !dump.includes(OBJET_NEWS));
  ok("ni les notifications Swap'Îles ni le message transactionnel", !dump.includes(OBJET_SWAP) && !dump.includes(OBJET_SWAP2) && !dump.includes(OBJET_SES));
  ok("ni le mot de passe en clair", !dump.includes(motDePasse));
  const bilan = JSON.parse(un(`select last_result::text from gmail_sync where id='compte'`));
  ok(`bilan chiffré, sans adresse : ${bilan.lus} lus, ${bilan.retenus} gardés, ${bilan.ignoresInconnus} inconnus, ${bilan.ignoresAutomatiques} automatiques`, bilan.retenus === 8 && bilan.ignoresAutomatiques === 5 && !JSON.stringify(bilan).includes("@"));

  console.log("\n— lecture seule : le fil IMAP et les drapeaux —");
  const commandes = fil.filter((l) => /^\S+ [A-Z]/i.test(l)).map((l) => l.replace(/^\S+ /, ""));
  const ecritures = commandes.filter((c) => /^(UID )?(STORE|MOVE|COPY|EXPUNGE)\b|^(APPEND|SELECT|CREATE|DELETE|RENAME|SUBSCRIBE|UNSUBSCRIBE|SETMETADATA|SETACL|CLOSE)\b/i.test(c));
  ok(`${commandes.length} commandes relevées : aucune d'écriture (STORE, MOVE, COPY, APPEND, EXPUNGE, SELECT…)${ecritures.length ? ` — trouvé : ${ecritures.join(" | ")}` : ""}`, commandes.length > 10 && ecritures.length === 0);
  const fetchs = commandes.filter((c) => /FETCH/i.test(c));
  ok(`tous les FETCH (${fetchs.length}) lisent avec BODY.PEEK, jamais BODY[ ni RFC822`, fetchs.length > 0 && fetchs.every((c) => !/BODY\[|RFC822(\.TEXT)?\b(?!\.SIZE)|BINARY\[/i.test(c.replace(/BODY\.PEEK\[|BINARY\.PEEK\[/gi, ""))));
  ok("chaque dossier ouvert avec EXAMINE (boîte de réception et envoyés)", commandes.some((c) => /^EXAMINE "?INBOX"?/i.test(c)) && commandes.some((c) => /^EXAMINE "\[Gmail\]\/Sent Mail"/i.test(c)));
  ok("dossier des envoyés trouvé par son attribut \\Sent (LIST)", commandes.some((c) => /^LIST/i.test(c)));
  const apres = drapeaux();
  ok("drapeaux \\Seen identiques avant et après le relevé (aucun message « lu », déplacé ni supprimé)", JSON.stringify(apres) === JSON.stringify(avant));
  ok("les messages non lus le restent", Object.values(apres).filter((v) => v === "cur:").length === 4);

  console.log("\n— sans réponse —");
  const attend = (objet) => un(`select awaiting_reply::text || '|' || coalesce(done_at::text, '') from directory_events where title = '${objet.replace(/'/g, "''")}' limit 1`);
  ok("fil répondu : pas « sans réponse », date de réponse notée", attend(`Question sur le planning ${jeu}`).startsWith("false|2"));
  ok("fil sans réponse (client) : « sans réponse »", attend(`Photos pour le site ${jeu}`) === "true|");
  ok("prospect qui a répondu à Emmanuel : « sans réponse »", attend(`Re: Proposition ${jeu}`) === "true|");
  ok("message envoyé : jamais « sans réponse »", attend(`Proposition ${jeu}`).startsWith("false"));
  ok("la réponse partie de l'admin lève « sans réponse » (date de réponse notée)", attend(`Question tarif ${jeu}`).startsWith("false|2"));

  console.log("\n— fiche contact —");
  p = await page(`/contacts/${client}`, cDir);
  ok("la fiche du client montre la section « E-mails » avec ses fils", p.statut === 200 && p.visible.includes(">E-mails<") && p.visible.includes(`Photos pour le site ${jeu}`) && p.visible.includes(`Re: Question sur le planning ${jeu}`));
  ok("badge « Sans réponse depuis 2 j », pièces jointes et lien Gmail", p.visible.includes("Sans réponse depuis 2 j") && p.visible.includes("atelier.jpg, logo-garage.pdf") && p.visible.includes("Ouvrir dans Gmail"));
  ok("les e-mails apparaissent aussi dans la frise", (p.visible.match(/E-mail reçu/g) ?? []).length >= 2 && p.visible.includes("E-mail envoyé"));
  p = await page(`/contacts/${client}?emails=sans-reponse`, cDir);
  ok("filtre « Sans réponse » : le fil répondu disparaît de la liste", p.visible.includes("Sans réponse (1)") && (p.visible.match(/data-fil-email/g) ?? []).length === 1);
  p = await page(`/contacts/${ficheTarif}`, cDir);
  ok(
    "doublon agent ventes / Gmail : affiché une seule fois, version Gmail avec son lien, « Écrit par l'agent ventes »",
    p.statut === 200 && !p.visible.includes(`E-mail envoyé par Emmanuel : « Re: Question tarif ${jeu} »`) && (p.visible.match(/data-ecrit-par-agent/g) ?? []).length === 1 && p.visible.includes("Écrit par l") && p.visible.includes("Ouvrir dans Gmail"),
  );
  ok("rien n'est supprimé en base : la ligne de l'agent ventes est toujours là", un(`select count(*) from directory_events where external_id = 'h:tarif-${jeu}'`) === "1");
  p = await page(`/contacts/${cabinet}`, cDir);
  ok("fiche du cabinet (même domaine) : le message de Paul y est", p.visible.includes(`Rendez-vous jeudi ? ${jeu}`));

  console.log("\n— Ce matin —");
  p = await page("/", cDir);
  ok("« À répondre » : les trois e-mails sans réponse", p.visible.includes(`E-mail : « Photos pour le site ${jeu} »`) && p.visible.includes(`E-mail : « Re: Proposition ${jeu} »`) && p.visible.includes(`E-mail : « Rendez-vous jeudi ? ${jeu} »`));
  const bloc = (objet) => {
    const i = p.visible.indexOf(`E-mail : « ${objet} »`);
    return p.visible.slice(Math.max(0, i - 700), i + 900);
  };
  ok("client sous contrat sans réponse depuis plus de 24 h : urgent, règle affichée", /Urgent/.test(bloc(`Photos pour le site ${jeu}`)) && bloc(`Photos pour le site ${jeu}`).includes("Client sous contrat, sans réponse depuis plus de 24 h"));
  ok("prospect qui a répondu il y a 3 h, sans mot d'urgence : peut attendre", /Peut attendre/.test(bloc(`Re: Proposition ${jeu}`)) && bloc(`Re: Proposition ${jeu}`).includes("Prospect qui a répondu, reçu il y a moins de 24 h"));
  ok("mot d'urgence (« rendez-vous ») : urgent", /Urgent/.test(bloc(`Rendez-vous jeudi ? ${jeu}`)) && bloc(`Rendez-vous jeudi ? ${jeu}`).includes("Contient « rendez-vous »"));
  ok("le fil répondu n'est pas à répondre", !p.visible.includes(`Question sur le planning ${jeu} »`));
  ok("le prospect qui a reçu la réponse de l'admin n'est pas à répondre", !p.visible.includes(`Question tarif ${jeu}`));
  ok("pied de colonne : Gmail relu", p.visible.includes("E-mails sans réponse relevés dans Gmail"));

  const kPhotos = `email:${filDe(`Photos pour le site ${jeu}`)}`;
  r = await matin("marquerTraite", [kPhotos], cDir);
  ok("« Traité » sur une ligne e-mail (clé email:<fil>)", r.resultat?.ok === true && un(`select state from ce_matin_archives where key='${kPhotos}'`) === `photos.${jeu}@test.local`);
  p = await page("/", cDir);
  ok("… la ligne disparaît", !p.visible.includes(`E-mail : « Photos pour le site ${jeu} »`));

  console.log("\n— incrémental, et retour d'une ligne archivée —");
  const positions = JSON.parse(un(`select folders::text from gmail_sync where id='compte'`));
  ok(`positions mémorisées (UIDVALIDITY + dernier UID) : boîte ${positions.inbox?.lastUid}, envoyés ${positions.sent?.lastUid}`, positions.inbox?.initialDone && positions.sent?.initialDone && positions.inbox.lastUid > 0 && positions.inbox.uidValidity);
  deposer("inbox", { cle: "photos-2", de: `Marie Hoarau <${MARIE}>`, a: EM, objet: `Re: Photos pour le site ${jeu}`, ilYa: 10 * 60_000, reponseA: "photos", texte: "Vous avez pu regarder ?", vu: false });
  // La réponse d'Emmanuel sur l'autre fil part AVANT le nouveau message de Marie :
  // un envoi à ce contact plus récent vaudrait réponse (règle « sans réponse »).
  deposer("sent", { cle: "planning-rep2", de: EM, a: `Marie Hoarau <${MARIE}>`, objet: `Re: Question sur le planning (suite) ${jeu}`, ilYa: 20 * 60_000, reponseA: "planning", texte: "Je confirme jeudi." });
  console.log("\n— nettoyage des e-mails gardés avant les règles actuelles —");
  // D'anciens événements, enregistrés comme le faisait l'ancien rapprochement.
  const clientMoment = un(`insert into clients (name, short_name, departments) values ('Moment Magic ${jeu}','MM ${jeu}','["social"]'::jsonb) returning id`);
  const ficheVide = un(`insert into directory_entries (client_id, name, kind, source) values ('${clientMoment}', 'Moment Magic ${jeu}', 'client', 'agence') returning id`);
  const clientNote = un(`insert into clients (name, short_name, departments) values ('Atelier Note ${jeu}','AN ${jeu}','["social"]'::jsonb) returning id`);
  const ficheNote = un(`insert into directory_entries (client_id, name, kind, source, note) values ('${clientNote}', 'Atelier Note ${jeu}', 'client', 'agence', 'Rappeler en décembre') returning id`);
  const ficheMarie = un(`select id from directory_entries where client_id = '${client}'`);
  const ancien = (entry, titre, de, contact, par, filA) =>
    un(`insert into directory_events (entry_id, source, kind, external_id, occurred_at, title, body, awaiting_reply, meta) values ('${entry}', 'gmail', 'email_entrant', 'ancien-${filA}-${jeu}', now() - interval '30 hours', ${"'" + titre.replace(/'/g, "''") + "'"}, 'Paiement à rembourser', true, '${JSON.stringify({ sens: "recu", de: { nom: "Swap Îles", email: de }, a: [{ nom: null, email: compte }], cc: [], destinataires: [compte], messageId: `ancien-${filA}-${jeu}@swapiles.com`, fil: `g:ancien-${filA}-${jeu}`, contact, par, dossier: "inbox" }).replace(/'/g, "''")}'::jsonb) returning id`);
  ancien(ficheVide, `[Swap Îles] Remboursement à valider (vendeur non expédié) ancien ${jeu}`, "contact@swapiles.com", "contact@swapiles.com", "domaine", "a");
  ancien(ficheMarie, `Ancien rattachement par Reply-To : paiement ${jeu}`, "contact@swapiles.com", MARIE, "adresse", "b");
  ancien(ficheNote, `Ancienne notification sur une fiche annotée ${jeu}`, "ventes@swapiles.com", "ventes@swapiles.com", "domaine", "c");
  sql(`insert into ce_matin_archives (key, "column", state, label) values ('email:g:ancien-a-${jeu}', 'repondre', 'x', 'MM ${jeu} · ancien')`);
  p = await page(`/?client=${client}`, cDir);
  {
    const i = p.visible.indexOf(`Ancien rattachement par Reply-To : paiement ${jeu}`);
    const b = p.visible.slice(Math.max(0, i - 700), i + 900);
    ok(
      "règle robuste : un e-mail dont l'expéditeur n'est pas l'adresse du client n'est ni « client sous contrat » ni urgent pour « paiement »",
      i >= 0 && /Peut attendre/.test(b) && !b.includes("Client sous contrat") && b.includes("ni un client ni un prospect connu"),
    );
  }
  const nettoyagesAvant = JOURNAL && existsSync(JOURNAL) ? (readFileSync(JOURNAL, "utf8").match(/Gmail : nettoyage/g) ?? []).length : 0;
  const avant2 = drapeaux();
  const ligneFil = fil.length;
  r = await gmail("synchroniserGmailMaintenant", undefined, cDir);
  ok(`« Synchroniser maintenant » : ${r.resultat?.message}`, r.resultat?.ok === true && /2 messages examinés, 2 gardés/.test(r.resultat.message));
  const nouvelles = fil.slice(ligneFil).map((l) => l.replace(/^\S+ /, ""));
  ok("second passage incrémental : recherche par UID au-delà du dernier lu (pas de SINCE)", nouvelles.some((c) => new RegExp(`^UID SEARCH UID ${positions.inbox.lastUid + 1}:\\*`, "i").test(c)) && !nouvelles.some((c) => /SEARCH.*SINCE/i.test(c)));
  ok("… et ne récupère que les nouveaux messages", nouvelles.filter((c) => /^UID FETCH \d+ \(.*HEADER\.FIELDS/i.test(c)).length === 2 && !nouvelles.some((c) => /^UID FETCH \d+[,:]\d+/i.test(c)));
  ok("aucun doublon dans la base (et les anciens événements hors règles retirés)", evts().length === 10);
  ok("nettoyage : les 3 anciens e-mails hors règles retirés", un(`select count(*) from directory_events where external_id like 'ancien-%-${jeu}'`) === "0");
  ok("nettoyage : leur « Traité » retiré", un(`select count(*) from ce_matin_archives where key like 'email:g:ancien-%-${jeu}'`) === "0");
  ok("nettoyage : la fiche vide créée pour la notification retirée", un(`select count(*) from directory_entries where id = '${ficheVide}'`) === "0");
  ok("nettoyage : la fiche annotée et celle du client aux vrais e-mails gardées", un(`select count(*) from directory_entries where id in ('${ficheNote}', '${ficheMarie}')`) === "2");
  ok("nettoyage : les vrais e-mails du client gardés", evts().includes(`Photos pour le site ${jeu}`) && evts().includes(`Re: Photos pour le site ${jeu}`));
  if (JOURNAL && existsSync(JOURNAL)) {
    const lignes = readFileSync(JOURNAL, "utf8").match(/\[pilot\] Gmail : nettoyage[^\n]*/g) ?? [];
    ok(`journal : « ${lignes.at(-1) ?? "(rien)"} » (des nombres seulement)`, lignes.length === nettoyagesAvant + 1 && /3 e-mail\(s\) retiré\(s\) \(2 rattaché\(s\) par domaine, 1 par adresse\), 1 « Traité » et 1 fiche\(s\) vide\(s\)/.test(lignes.at(-1) ?? "") && !/@/.test(lignes.at(-1) ?? ""));
  }
  ok("drapeaux toujours identiques après le second relevé", JSON.stringify(drapeaux()) === JSON.stringify(avant2));
  ok("le fil « Photos » a un nouveau message reçu : toujours sans réponse, porté par le nouveau", attend(`Re: Photos pour le site ${jeu}`) === "true|" && attend(`Photos pour le site ${jeu}`).startsWith("false"));
  p = await page("/", cDir);
  ok("nouveau message dans un fil archivé : la ligne revient d'elle-même", p.visible.includes(`E-mail : « Re: Photos pour le site ${jeu} »`) && p.visible.includes("Du nouveau depuis l"));

  if (JOURNAL && existsSync(JOURNAL)) {
    const n = (readFileSync(JOURNAL, "utf8").match(/Gmail : nettoyage/g) ?? []).length;
    await gmail("synchroniserGmailMaintenant", undefined, cDir);
    ok("nettoyage idempotent : un relevé de plus ne retire plus rien (rien au journal)", (readFileSync(JOURNAL, "utf8").match(/Gmail : nettoyage/g) ?? []).length === n);
  }

  console.log("\n— un seul relevé à la fois —");
  const loginsAvant = fil.filter((l) => /^\S+ (LOGIN|AUTHENTICATE)/i.test(l)).length;
  const [r1, r2] = await Promise.all([gmail("synchroniserGmailMaintenant", undefined, cDir), gmail("synchroniserGmailMaintenant", undefined, cDir)]);
  const logins = fil.filter((l) => /^\S+ (LOGIN|AUTHENTICATE)/i.test(l)).length - loginsAvant;
  ok(`deux clics simultanés : une seule connexion IMAP (${logins})`, r1.resultat?.ok === true && r2.resultat?.ok === true && logins === 1);
  sql(`update gmail_sync set lease_until = now() + interval '5 minutes' where id='compte'`);
  const lignesAvant = fil.length;
  r = await gmail("synchroniserGmailMaintenant", undefined, cDir);
  ok("bail pris par un autre processus : « déjà en cours », aucune connexion", r.resultat?.ok === true && /déjà en cours/.test(r.resultat.message) && fil.length === lignesAvant);
  sql(`update gmail_sync set lease_until = null where id='compte'`);

  console.log("\n— droits —");
  for (const [qui, c] of [
    ["membre du pôle social", cSoc],
    ["membre du pôle web", cWeb],
    ["client du portail", cPortail],
    ["visiteur sans session", null],
  ]) {
    p = await page("/reglages", c);
    ok(`${qui} : Réglages (carte Gmail) inaccessible`, p.statut >= 300 && p.statut < 400 && !p.visible.includes("Gmail (lecture seule)"));
    for (const [nom, arg] of [
      ["testerEtEnregistrerGmail", { adresse: compte, motDePasse }],
      ["synchroniserGmailMaintenant", undefined],
      ["deconnecterGmailAction", { effacer: true }],
    ]) {
      r = await gmail(nom, arg, c);
      ok(`${qui} : ${nom} refusé`, r.resultat?.ok !== true);
    }
    r = await matin("marquerTraite", [`email:${filDe(`Rendez-vous jeudi ? ${jeu}`)}`], c);
    ok(`${qui} : « Traité » sur un e-mail refusé`, r.resultat?.ok !== true);
  }
  ok("le secret et les e-mails sont toujours là après ces tentatives", un(`select count(*) from integrations where id='gmail'`) === "1" && evts().length === 10);
  p = await page("/", cSoc);
  ok("pôle social : l'accueil ne montre aucun e-mail ni l'état de Gmail", p.statut === 200 && !p.html.includes(`Photos pour le site ${jeu}`) && !p.html.includes("Rendez-vous jeudi") && !p.visible.includes("Gmail n'est pas relié"));
  p = await page(`/contacts/${client}`, cSoc);
  ok("pôle social : la fiche n'a ni section « E-mails » ni e-mails dans la frise", p.statut === 200 && !p.visible.includes(">E-mails<") && !p.html.includes(`Photos pour le site ${jeu}`) && !p.visible.includes("E-mail reçu"));
  p = await page(`/contacts/${ficheTarif}`, cSoc);
  ok("pôle social (pas d'e-mails) : la ligne de l'agent ventes reste affichée", p.statut === 200 && p.visible.includes(`E-mail envoyé par Emmanuel : « Re: Question tarif ${jeu} »`) && !p.html.includes("data-ecrit-par-agent"));
  p = await page(`/contacts/${client}`, cPortail);
  ok("client du portail : la fiche le renvoie au portail", p.statut >= 300 && p.statut < 400 && p.location.includes("/portail"));
  p = await page(`/contacts/${client}`, cWeb);
  ok("pôle web : rien (fiche d'un client du pôle social introuvable)", p.statut === 404 || (!p.html.includes(`Photos pour le site ${jeu}`) && !p.visible.includes(">E-mails<")));

  console.log("\n— déconnecter —");
  r = await gmail("deconnecterGmailAction", { effacer: false }, cDir);
  ok("« Déconnecter » : mot de passe effacé, e-mails gardés", r.resultat?.ok === true && un(`select count(*) from integrations where id='gmail'`) === "0" && evts().length === 10);
  p = await page("/", cDir);
  ok("« Ce matin » dit que Gmail n'est pas relié (au lieu d'afficher zéro)", p.visible.includes("Gmail n&#x27;est pas relié") || p.visible.includes("Gmail n'est pas relié"));
  p = await page(`/contacts/${client}`, cDir);
  ok("la fiche renvoie vers Réglages", p.visible.includes('data-emails="non-relie"') && p.visible.includes("Relier Gmail dans Réglages"));
  r = await gmail("synchroniserGmailMaintenant", undefined, cDir);
  ok("plus de relevé possible", r.resultat?.ok === false);
  await gmail("testerEtEnregistrerGmail", { adresse: compte, motDePasse }, cDir);
  await attendreReleve(maintenantS() - 60);
  r = await gmail("deconnecterGmailAction", { effacer: true }, cDir);
  ok("« Déconnecter » en effaçant les e-mails : plus aucune ligne Gmail", r.resultat?.ok === true && un(`select count(*) from directory_events where source='gmail'`) === "0");

  console.log("\n— aucun mot de passe nulle part —");
  const tout = reponses.join("\n");
  ok(`${reponses.length} réponses de Pilot (pages et actions) : aucune ne contient le mot de passe`, !tout.includes(motDePasse) && !tout.includes(motDePasseEspace));
  if (JOURNAL && existsSync(JOURNAL)) {
    const journal = readFileSync(JOURNAL, "utf8");
    ok(`journal du serveur (${journal.split("\n").length} lignes) : aucun mot de passe`, !journal.includes(motDePasse) && !journal.includes(motDePasseEspace) && !journal.includes(Buffer.from(`\0${compte}\0${motDePasse}`).toString("base64")));
  } else {
    ok("journal du serveur fourni (JOURNAL=…)", false);
  }
} catch (e) {
  console.error(e);
  codeSortie = 1;
} finally {
  console.log("\n— nettoyage —");
  sql(`delete from ce_matin_archives where key like 'email:%' and label like '%${jeu}%'`);
  sql(`delete from directory_entries where name like '%${jeu}%'`);
  sql(`delete from users where email like '%-${jeu}@exemple.test'`);
  sql(`delete from ce_matin_archives where key like 'email:g:ancien-%-${jeu}'`);
  sql(`delete from clients where name like '%${jeu}'`);
  sql(`delete from integrations where id='gmail' and account_id='${compte}'`);
  sql(`delete from gmail_sync where id='compte' and (account='${compte}' or account is null)`);
  relais.close();
  if (dovecot.exitCode === null) {
    dovecot.kill("SIGTERM");
    await Promise.race([new Promise((r) => dovecot.once("exit", r)), attendre(5000)]);
  }
  try {
    execFileSync("pkill", ["-f", path.join(dir, "dovecot.conf")]);
  } catch {
    // déjà arrêté
  }
  rmSync(dir, { recursive: true, force: true });
  console.log("décor effacé, Dovecot et le relais arrêtés");
}

console.log(`\n${verts} vérifications vertes, ${rouges.length} rouge(s).`);
if (rouges.length || codeSortie) {
  for (const r of rouges) console.log(`  ✗ ${r}`);
  if (sortieDovecot.trim()) console.log(`\nDovecot :\n${sortieDovecot.slice(0, 2000)}`);
  process.exit(1);
}
process.exit(0);
