"use client";

import { ErreurPage } from "@/components/ui/ErreurPage";

/** Dernier filet : une erreur dans la mise en page racine elle-même. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="fr">
      <body>
        <ErreurPage error={error} />
      </body>
    </html>
  );
}
