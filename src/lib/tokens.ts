import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Les jetons opaques du projet : sessions de navigateur et clés d'API.
 *
 * Extrait de `auth.ts` pour que la couche des clés d'API s'en serve sans
 * importer tout l'attirail des sessions — `cookies()`, `redirect()`, et les
 * gardes qui renvoient vers une page. Une clé d'API n'a besoin d'aucun des
 * trois, et une route ne doit jamais rediriger.
 *
 * Volontairement pas dans `auth.shared.ts` : ce fichier-là est importé par
 * `proxy.ts`, et y faire entrer `node:crypto` alourdirait le bundle du proxy
 * sans qu'il s'en serve.
 */

/**
 * L'empreinte stockée en base, jamais le jeton lui-même : une fuite de la base
 * ne donne alors ni les sessions ni les clés.
 *
 * SHA-256 et non scrypt, contrairement aux mots de passe. Le choix se justifie
 * par la nature de l'entrée : un jeton fait 256 bits d'aléa, il n'existe aucun
 * dictionnaire contre lui. scrypt est lent par construction — c'est sa raison
 * d'être face à un mot de passe devinable — et cette lenteur se paierait ici à
 * chaque requête, pour rien.
 */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/**
 * Un jeton neuf : 32 octets d'aléa cryptographique, en base64url pour tenir
 * dans une en-tête HTTP et dans un cookie sans encodage supplémentaire.
 */
export const newToken = (): string => randomBytes(32).toString("base64url");
