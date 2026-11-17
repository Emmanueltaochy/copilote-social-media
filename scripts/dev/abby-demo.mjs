#!/usr/bin/env node
//
// Faux serveur Abby, pour voir l'argent qui dort en local sans vraie clé ni
// vraies factures. Toutes les données ci-dessous sont fictives (« DEMO »).
//
//   node scripts/dev/abby-demo.mjs            # écoute sur 127.0.0.1:3999
//   ABBY_API_URL=http://127.0.0.1:3999 ABBY_API_KEY=demo-local npx next dev -p 3111
//
// Ne répond qu'aux deux routes lues par src/lib/abby.ts : /v2/billings et /v2/billing/:id.

import { createServer } from "node:http";

const JOUR = 86_400;
const t = (jours) => Math.floor(Date.now() / 1000) + jours * JOUR;
const client = (id, name, email) => ({ id, name, email });

const DOCS = [
  { id: "demo-f101", type: "invoice", number: "F-DEMO-101", state: "finalized", title: "Tournage atelier (démo)", customer: client("demo-cus-sudauto", "Garage Sud Auto", "contact@sudauto.test"), totalAmountWithTax: 72000, emittedAt: t(-45), dueAt: t(-15) },
  { id: "demo-f102", type: "invoice", number: "F-DEMO-102", state: "finalized", title: "Forfait novembre (démo)", customer: client("demo-cus-jardins", "Les Jardins du Volcan", "bonjour@jardins.test"), totalAmountWithTax: 30000, emittedAt: t(-5), dueAt: t(10) },
  { id: "demo-f090", type: "invoice", number: "F-DEMO-090", state: "paid", title: "Forfait octobre (démo)", customer: client("demo-cus-tikaz", "Boulangerie Ti Kaz", "marie@tikaz.test"), totalAmountWithTax: 45000, emittedAt: t(-35), dueAt: t(-5), paidAt: t(-6) },
  { id: "demo-f080", type: "invoice", number: "F-DEMO-080", state: "paid", title: "Création du logo (démo)", customer: client("demo-cus-tikaz", "Boulangerie Ti Kaz", "marie@tikaz.test"), totalAmountWithTax: 90000, emittedAt: t(-120), dueAt: t(-90), paidAt: t(-95) },
  { id: "demo-d020", type: "estimate", number: "D-DEMO-020", state: "signed", title: "Site vitrine (démo)", customer: client("demo-cus-lagon", "Atelier Lagon Spa", "spa@lagon.test"), totalAmountWithTax: 180000, emittedAt: t(-25), signedAt: t(-20), advances: [{ totalAmountWithTax: 54000 }] },
  { id: "demo-d018", type: "estimate", number: "D-DEMO-018", state: "signed", title: "Pack vidéo (démo)", customer: client("demo-cus-kreol", "Studio Kréol Fit", "fit@kreol.test"), totalAmountWithTax: 120000, emittedAt: t(-60), signedAt: t(-55), finalInvoice: { id: "demo-f070", number: "F-DEMO-070" } },
  { id: "demo-d021", type: "estimate", number: "D-DEMO-021", state: "finalized", title: "Pack vidéo de fin d'année (démo)", customer: client("demo-cus-tikaz", "Boulangerie Ti Kaz", "marie@tikaz.test"), totalAmountWithTax: 65000, emittedAt: t(-3) },
];

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (!req.headers.authorization?.startsWith("Bearer ")) return json(401, { error: "clé absente" });
  const un = url.pathname.match(/^\/v2\/billing\/([^/]+)$/);
  if (un) {
    const d = DOCS.find((x) => x.id === decodeURIComponent(un[1]));
    return d ? json(200, d) : json(404, { error: "inconnu" });
  }
  if (url.pathname === "/v2/billings") {
    const types = url.searchParams.getAll("type");
    const etats = url.searchParams.getAll("state");
    const cust = url.searchParams.get("customerId");
    const q = (url.searchParams.get("search") ?? "").toLowerCase();
    // La liste, comme chez Abby, ne dit pas si un devis a une facture finale.
    const docs = DOCS.filter(
      (d) =>
        (!types.length || types.includes(d.type)) &&
        (!etats.length || etats.includes(d.state)) &&
        (!cust || d.customer.id === cust) &&
        (!q || d.customer.name.toLowerCase().includes(q) || d.number.toLowerCase().includes(q)),
    ).map((d) => {
      const copie = { ...d };
      delete copie.finalInvoice;
      delete copie.advances;
      return copie;
    });
    return json(200, { docs, hasNextPage: false });
  }
  json(404, { error: "route inconnue" });
}).listen(Number(process.env.PORT ?? 3999), "127.0.0.1", () => console.log("faux Abby (démo) sur 127.0.0.1:" + (process.env.PORT ?? 3999)));
