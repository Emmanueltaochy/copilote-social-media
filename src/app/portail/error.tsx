"use client";

import { ErreurPage } from "@/components/ui/ErreurPage";

export default function Erreur({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErreurPage error={error} retry={retry} />;
}
