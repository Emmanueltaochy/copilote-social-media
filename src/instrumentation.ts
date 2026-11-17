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
  } catch (error) {
    // Un échec de migration doit arrêter le démarrage : servir l'application
    // sur un schéma qui ne correspond pas au code produirait des erreurs
    // incompréhensibles, page par page, au lieu d'un seul message clair.
    console.error("[pilot] échec des migrations", error);
    throw error;
  }

  // Les secrets encore en clair dans `integrations` (clés d'avant le
  // chiffrement) sont chiffrés sur place, une ligne à la fois, vérifiés avant
  // d'écrire. Idempotent ; sans clé de chiffrement lisible, rien n'est
  // touché (voir convertirSecretsEnClair dans src/lib/secrets.ts). Un échec
  // n'empêche jamais le démarrage : les secrets clairs restent lisibles.
  const { convertirSecretsEnClair } = await import("@/lib/secrets");
  await convertirSecretsEnClair().catch((e) => console.warn("[pilot] secrets : conversion interrompue,", (e as Error).message));

  // La vidéo de bienvenue livrée avec cette version (une seule fois).
  const { installBundledPortalVideo } = await import("@/lib/portail-video-bundle");
  await installBundledPortalVideo().catch((e) => console.warn("[pilot] vidéo du portail", e));

  // Relevé Metricool : toutes les heures on regarde si le dernier date de
  // plus de 6 h. Sans clé enregistrée, rien ne part.
  const { syncIfStale, syncRecentPosts } = await import("@/lib/metricool");
  const tick = async () => {
    await syncIfStale(6).catch((e) => console.warn("[pilot] relevé Metricool", e));
    // Les publications des 3 derniers jours, y compris celles postées hors de
    // Pilot : elles entrent dans l'engagement du mois dans l'heure.
    await syncRecentPosts().catch((e) => console.warn("[pilot] relevé récent", e));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 3_600_000).unref?.();

  // Publications programmées : toutes les 10 minutes, on demande à Metricool
  // ce qui est parti (le contenu passe « publié » avec son lien) ou ce qui a
  // échoué (le responsable est prévenu).
  const { syncPublications } = await import("@/lib/metricool-schedule");
  const pubTick = () => syncPublications().catch((e) => console.warn("[pilot] suivi des publications", e));
  setTimeout(pubTick, 90_000);
  setInterval(pubTick, 10 * 60_000).unref?.();

  // Gmail (lecture seule) : toutes les 12 minutes, les nouveaux messages de la
  // boîte de réception et des envoyés. Sans mot de passe enregistré, rien ne
  // part. Un bail en base empêche deux relevés simultanés (redémarrage,
  // bouton « Synchroniser maintenant ») ; chaque relevé est borné à 4 minutes.
  const { releveRegulier } = await import("@/lib/gmail");
  const gmailTick = () => releveRegulier().catch((e) => console.warn("[pilot] relevé Gmail", (e as Error).message));
  setTimeout(gmailTick, 120_000);
  setInterval(gmailTick, 12 * 60_000).unref?.();
}
