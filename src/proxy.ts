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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
