import { Onglets } from "@/components/ui/Onglets";
import { NAV_CONTACTS } from "@/data/nav";

/**
 * Les trois vues de l'espace « Contacts » : l'annuaire (tout le monde), le
 * portefeuille (les clients sous contrat, et en créer un) et les engagements
 * du mois (publié contre vendu). Un seul espace pour « tout sur un client ».
 */
export function EspaceContacts({ actif, social }: { actif: "/contacts" | "/clients" | "/avancement"; social: boolean }) {
  return (
    <Onglets
      label="Espace contacts"
      items={NAV_CONTACTS.filter((i) => social || !i.pole).map((i) => ({ href: i.href, label: i.label, actif: i.href === actif }))}
    />
  );
}
