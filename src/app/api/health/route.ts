/**
 * Sonde de santé. Utilisée par le HEALTHCHECK Docker et par le déploiement
 * pour vérifier que la nouvelle version répond avant de considérer le déploiement
 * réussi.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "copilote-social-media",
    // Renseigné à la construction de l'image par le workflow de déploiement.
    version: process.env.APP_VERSION ?? "dev",
  });
}
