import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth.shared";

/**
 * Premier filtre : renvoie vers la connexion quiconque n'a pas de cookie de
 * session. Il ne vérifie pas la validité du cookie — c'est volontaire.
 *
 * Le proxy s'exécute avant le rendu, sans accès à la base : y placer
 * l'autorité sur les droits reviendrait à faire confiance à un cookie. La
 * vraie vérification a lieu côté serveur, dans requireUser() / requireStaff().
 * Ici on évite seulement un aller-retour inutile aux visiteurs non connectés.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/connexion") ||
    pathname.startsWith("/bienvenue") ||
    pathname.startsWith("/invitation") ||
    // Le logo et le visuel de la page de connexion : ils sont servis à qui n'a
    // pas encore de session, puisqu'ils sont cette page. La route ne lit jamais
    // un chemin dans l'adresse — elle relit celui des réglages — et ne peut
    // donc servir que ces deux images.
    pathname.startsWith("/api/branding") ||
    // L'API des agents s'authentifie par clé, pas par cookie. Sans cette
    // exception, une requête porteuse d'une clé mais sans cookie recevrait une
    // redirection vers /connexion — que `fetch` suivrait pour obtenir la page
    // de connexion en 200, et que l'appelant lirait comme un succès. C'est le
    // défaut déjà corrigé dans currentDirection() : une route répond, elle ne
    // renvoie pas ailleurs. La vérification a lieu dans withApiKey().
    pathname.startsWith("/api/agent") ||
    // Même raison pour les modèles de brief : ce sont des routes d'API, pas
    // des pages. Un appel sans session doit recevoir un 401 en JSON, pas une
    // redirection vers l'écran de connexion — que `fetch` suivrait pour rendre
    // une page en 200. La session est vérifiée dans la route, par exigeEquipe().
    //
    // Chemins exacts plutôt que préfixe pour « /api/briefs » : un préfixe
    // dispenserait de garde toute route future placée dessous, y compris celle
    // que quelqu'un ajoutera sans savoir que cette ligne existe. Le défaut
    // penche du bon côté — une nouvelle route reçoit la redirection du proxy,
    // ce qui se remarque tout de suite, au lieu d'être servie sans contrôle.
    pathname === "/api/briefs" ||
    pathname === "/api/brief-templates" ||
    pathname.startsWith("/api/brief-templates/") ||
    pathname.startsWith("/api/health");

  if (isPublic) return NextResponse.next();

  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/connexion", request.url);
    // Mémorise la page demandée pour y revenir après la connexion.
    if (pathname !== "/") url.searchParams.set("suite", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Sans exclusion, le proxy s'appliquerait aussi aux fichiers statiques et
  // bloquerait le CSS et les images de la page de connexion elle-même.
  //
  // « api/upload » est écarté pour une autre raison, plus grave : dès qu'un
  // proxy existe, Next recopie le corps de chaque requête en mémoire pour
  // qu'il puisse être lu deux fois, avec un plafond de dix mégaoctets. Au-delà,
  // il tronque — et, par conception, sans erreur ni avertissement au client.
  // Les photos de plus de dix mégaoctets arrivaient donc coupées, et la
  // bibliothèque se remplissait d'images à moitié décodées. Hors du filtre,
  // le corps traverse en flux, sans copie ni plafond. Le contrôle d'accès n'y
  // perd rien : la route vérifie elle-même la session, comme toutes les autres.
  matcher: [
    "/((?!api/upload|api/client-files|api/avatar|api/branding|api/promo|api/invoice|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
