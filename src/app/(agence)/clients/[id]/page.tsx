import { redirect } from "next/navigation";

/**
 * L'ancienne fiche client (« Contrat, portail et réglages »).
 *
 * Il n'y a plus qu'une fiche par client : /contacts/[id]. Son contenu y est
 * repris en onglets (« Contrat et suivi », « Documents et factures »,
 * « Portail et accès »). Cette adresse reste valable — favoris, liens dans les
 * notifications, e-mails déjà envoyés — et mène à l'onglet qu'elle montrait en
 * premier. Les droits sont vérifiés par la fiche elle-même.
 */
export default async function AncienneFicheClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/contacts/${encodeURIComponent(id)}?onglet=contrat`);
}
