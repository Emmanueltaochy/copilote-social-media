import type { Tone } from "@/lib/tone";

/** The client-facing view of Cap Marine's month. */
export const PORTAL = {
  pending: [
    {
      kind: "REEL",
      title: "Reel « Sortie coucher de soleil »",
      when: "Prévu le 20 août à 18:00",
      age: "En attente depuis 6 jours",
      tone: "warn" as Tone,
    },
    {
      kind: "FEED",
      title: "Post feed « Nouvelle formule anniversaire »",
      when: "Prévu le 27 août à 11:00",
      age: "En attente depuis 2 jours",
      tone: "muted" as Tone,
    },
    {
      kind: "CARR",
      title: "Carrousel « Flotte 2026 »",
      when: "Prévu le 29 août à 10:00",
      age: "En attente depuis 1 jour",
      tone: "muted" as Tone,
    },
    {
      kind: "STO",
      title: "Story « Dernières places de septembre »",
      when: "Prévu le 30 août à 09:00",
      age: "En attente depuis 4 heures",
      tone: "muted" as Tone,
    },
  ],
  kpis: [
    { label: "Contenus publiés", value: "9", meta: "sur 16 prévus ce mois", tone: "muted" as Tone },
    { label: "Portée cumulée", value: "48 200", meta: "+12 % vs. juillet", tone: "ok" as Tone },
    { label: "Interactions", value: "3 140", meta: "+8 % vs. juillet", tone: "ok" as Tone },
    { label: "Clics vers le site", value: "612", meta: "−4 % vs. juillet", tone: "warn" as Tone },
  ],
  upcoming: [
    {
      when: "Jeu. 27 août",
      title: "Tournage au port de Saint-Gilles",
      state: "Équipe confirmée",
      tone: "ok" as Tone,
    },
    {
      when: "Jeu. 27 août",
      title: "Post feed « Nouvelle formule anniversaire »",
      state: "Attend votre validation",
      tone: "warn" as Tone,
    },
    {
      when: "Sam. 29 août",
      title: "Carrousel « Flotte 2026 »",
      state: "Attend votre validation",
      tone: "warn" as Tone,
    },
    {
      when: "Dim. 30 août",
      title: "Story « Dernières places de septembre »",
      state: "Attend votre validation",
      tone: "warn" as Tone,
    },
  ],
};
