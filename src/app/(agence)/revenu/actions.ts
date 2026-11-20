"use server";

import { revalidatePath } from "next/cache";
import { currentDirection } from "@/lib/auth";
import { enregistrerReglagesRevenu } from "@/lib/revenu";
import { PLAFOND_OBJECTIF_CENTS, centimesDepuisSaisie, type Palier } from "@/lib/revenu-regles";

export type EtatReglages = { ok: boolean; message: string } | null;

/**
 * Enregistre l'objectif de revenu mensuel, ses paliers, le taux de TVA de
 * l'estimation hors taxes et ce que la barre compare (direction seulement).
 * Rien n'est envoyé à GoCardless : ce sont des réglages de Pilot.
 */
export async function enregistrerObjectif(_avant: EtatReglages, form: FormData): Promise<EtatReglages> {
  if (!(await currentDirection())) return { ok: false, message: "Réservé à la direction." };
  const texte = (k: string) => String(form.get(k) ?? "").trim();

  const objectifCents = centimesDepuisSaisie(texte("objectif"));
  if (!objectifCents || objectifCents <= 0 || objectifCents > PLAFOND_OBJECTIF_CENTS) return { ok: false, message: "L'objectif doit être un montant en euros, par exemple 10 000." };

  const paliers: Palier[] = [];
  for (const i of [1, 2, 3]) {
    const montant = texte(`palier${i}`);
    const libelle = texte(`libelle${i}`).slice(0, 60);
    if (!montant && !libelle) continue;
    const c = centimesDepuisSaisie(montant);
    if (!c || c <= 0) return { ok: false, message: `Palier ${i} : indiquez un montant en euros (ou videz les deux champs pour le retirer).` };
    if (!libelle) return { ok: false, message: `Palier ${i} : donnez-lui un nom, par exemple « Embauche n° 1 ».` };
    if (c >= objectifCents) return { ok: false, message: `Palier ${i} : il doit être plus bas que l'objectif.` };
    paliers.push({ montantCents: c, libelle });
  }

  const taux = Number(texte("tva").replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(taux) || taux < 0 || taux > 30) return { ok: false, message: "Le taux de TVA doit être entre 0 et 30 %." };
  const base = texte("base") === "ht" ? "ht" : "preleve";

  await enregistrerReglagesRevenu({ objectifCents, paliers: paliers.sort((a, b) => a.montantCents - b.montantCents), tauxTva: Math.round(taux * 100) / 100, base });
  revalidatePath("/revenu");
  revalidatePath("/");
  return { ok: true, message: "Enregistré." };
}
