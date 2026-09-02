/**
 * Applique les migrations au démarrage du serveur.
 *
 * Le déploiement se résume ainsi à « tirer l'image et redémarrer » : aucune
 * commande manuelle à lancer sur le VPS, donc aucune étape qu'on puisse
 * oublier entre le code et le schéma qu'il attend.
 */
export async function register() {
  // Next exécute aussi ce fichier pendant la construction, où aucune base
  // n'existe : on ne migre qu'au démarrage réel du serveur.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) {
    console.warn("[pilot] DATABASE_URL absent : migrations ignorées.");
    return;
  }

  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db } = await import("@/db");

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("[pilot] schéma à jour");

    // Après le schéma, les données. La conversion des briefs hérités ne lève
    // jamais : un brief non converti garde ses `brief_fields` intactes, ce qui
    // ne justifie pas de refuser de démarrer.
    try {
      const { convertirBriefsHerites, journaliserConversion } = await import(
        "@/lib/brief-migration"
      );
      journaliserConversion(await convertirBriefsHerites());
    } catch (error) {
      console.error("[pilot] conversion des briefs impossible", error);
    }
  } catch (error) {
    // Un échec de migration doit arrêter le démarrage : servir l'application
    // sur un schéma qui ne correspond pas au code produirait des erreurs
    // incompréhensibles, page par page, au lieu d'un seul message clair.
    console.error("[pilot] échec des migrations", error);
    throw error;
  }
}
