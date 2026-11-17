-- Démonstration locale de l'annuaire et du bloc « Ce matin » (jamais en production).
-- Tout est fictif : noms suivis de « (démo) », adresses en .test, factures sans fichier.
-- Prérequis : scripts/dev/seed-demo.sql (clients Ti Kaz, Sud Auto, Lagon Spa, Kréol Fit, Jardins).
--   psql "$DATABASE_URL" -f scripts/dev/seed-annuaire-demo.sql
-- Pour l'argent lu chez Abby, voir scripts/dev/abby-demo.mjs (faux serveur, données fictives).

BEGIN;

-- Fiches hors clients : bouche-à-oreille, Swap'Îles.
INSERT INTO directory_entries (name, contact_name, kind, source, activity, status, email, phone, city, country, sector, next_action, next_action_on, name_key, email_key, last_activity_at, external_source, external_id)
VALUES
  ('Restaurant Le Badamier (démo)', 'Paul Démo, gérant', 'prospect', 'bouche_a_oreille', 'agence', 'rdv', 'paul@badamier.test', '0262 00 00 01', 'Saint-Leu', 'La Réunion', 'Restaurant',
   'Préparer le rendez-vous : refonte du site et carte en ligne', (now() AT TIME ZONE 'Indian/Reunion')::date, 'restaurant le badamier demo|saint leu', 'paul@badamier.test', now() - interval '2 days', 'demo', 'badamier'),
  ('Ti Boutik Créole (démo)', 'Nadia Démo', 'partenaire', 'swapiles', 'swapiles', NULL, 'nadia@tiboutik.test', '0692 00 00 02', 'Saint-Pierre', 'La Réunion', 'Artisanat',
   'Relancer pour la mise en ligne de ses annonces Swap''Îles', (now() AT TIME ZONE 'Indian/Reunion')::date - 2, 'ti boutik creole demo|saint pierre', 'nadia@tiboutik.test', now() - interval '5 days', 'demo', 'tiboutik'),
  ('Kaz Échange Saint-Denis (démo)', 'Jean Démo', 'prospect', 'swapiles', 'swapiles', 'contacte', 'jean@kazechange.test', NULL, 'Saint-Denis', 'La Réunion', 'Dépôt-vente',
   NULL, NULL, 'kaz echange saint denis demo|saint denis', 'jean@kazechange.test', now() - interval '9 days', 'demo', 'kazechange')
ON CONFLICT (external_source, external_id) DO NOTHING;

-- La fiche du client Ti Kaz (couche relationnelle du compte).
INSERT INTO directory_entries (client_id, name, contact_name, kind, source, activity, email, phone, city, country, next_action, next_action_on, email_key, name_key, last_activity_at, tags)
SELECT id, name, 'Marie Démo, gérante', 'client', 'bouche_a_oreille', 'agence', 'marie@tikaz.test', '0262 00 00 03', 'Saint-Paul', 'La Réunion',
       'Proposer le pack vidéo de fin d''année', (now() AT TIME ZONE 'Indian/Reunion')::date, 'marie@tikaz.test', 'boulangerie ti kaz|saint paul', now() - interval '1 day', '["fidèle"]'::jsonb
FROM clients WHERE short_name = 'Ti Kaz'
ON CONFLICT (client_id) DO NOTHING;
UPDATE clients SET abby_customer_id = 'demo-cus-tikaz' WHERE short_name = 'Ti Kaz' AND abby_customer_id IS NULL;

-- Historique fictif d'un échange (comme le ferait Gmail à l'étape 2).
INSERT INTO directory_events (entry_id, source, kind, external_id, occurred_at, title)
SELECT e.id, 'note', 'action', 'demo-1', now() - interval '6 days', 'Rencontre au salon des artisans (démo) : intéressée par une boutique en ligne'
FROM directory_entries e WHERE e.external_id = 'tiboutik'
ON CONFLICT DO NOTHING;

-- Demandes de devis du portail : une qui traîne (3 jours), une toute fraîche (5 h).
INSERT INTO quote_requests (client_id, subject, kind, details, status, created_at, updated_at)
SELECT id, 'Vidéo de présentation de l''institut (démo)', 'social', 'Demande fictive pour la démonstration.', 'nouvelle', now() - interval '3 days', now() - interval '3 days'
FROM clients WHERE short_name = 'Lagon Spa'
  AND NOT EXISTS (SELECT 1 FROM quote_requests q WHERE q.subject = 'Vidéo de présentation de l''institut (démo)');
INSERT INTO quote_requests (client_id, subject, kind, details, status, created_at, updated_at)
SELECT id, 'Page de réservation des cours (démo)', 'site', 'Demande fictive pour la démonstration.', 'nouvelle', now() - interval '5 hours', now() - interval '5 hours'
FROM clients WHERE short_name = 'Kréol Fit'
  AND NOT EXISTS (SELECT 1 FROM quote_requests q WHERE q.subject = 'Page de réservation des cours (démo)');

-- Un contenu en validation chez Lagon Spa, commenté par le client il y a 30 h, sans réponse.
INSERT INTO contents (client_id, title, kind, network, status, submitted_at, scheduled_at)
SELECT id, 'Carrousel soins d''hiver (démo)', 'carrousel', 'instagram', 'validation', now() - interval '4 days', now() + interval '3 days'
FROM clients WHERE short_name = 'Lagon Spa'
  AND NOT EXISTS (SELECT 1 FROM contents c WHERE c.title = 'Carrousel soins d''hiver (démo)');
INSERT INTO comments (content_id, author_id, body, created_at)
SELECT c.id, u.id, 'Pouvez-vous remplacer la photo 2 par une vue de la cabine ? (démo)', now() - interval '30 hours'
FROM contents c, users u
WHERE c.title = 'Carrousel soins d''hiver (démo)' AND u.email = 'client.demo@taochy.test'
  AND NOT EXISTS (SELECT 1 FROM comments x WHERE x.content_id = c.id);

-- Factures déposées dans Pilot (sans fichier réel).
INSERT INTO invoices (client_id, number, label, amount_cents, issued_on, due_on, paid_on, filename, storage_path, mime_type)
SELECT id, 'F-DEMO-001', 'Forfait octobre (démo)', 60000, current_date - 40, current_date - 10, NULL, 'facture-demo.pdf', 'demo/absent.pdf', 'application/pdf'
FROM clients WHERE short_name = 'Sud Auto' AND NOT EXISTS (SELECT 1 FROM invoices WHERE number = 'F-DEMO-001');
INSERT INTO invoices (client_id, number, label, amount_cents, issued_on, due_on, paid_on, filename, storage_path, mime_type)
SELECT id, 'F-DEMO-002', 'Forfait septembre (démo)', 45000, current_date - 70, current_date - 40, current_date - 38, 'facture-demo.pdf', 'demo/absent.pdf', 'application/pdf'
FROM clients WHERE short_name = 'Ti Kaz' AND NOT EXISTS (SELECT 1 FROM invoices WHERE number = 'F-DEMO-002');

-- Un document partagé dans le portail.
INSERT INTO client_files (client_id, filename, storage_path, mime_type, size_bytes, label, visibility)
SELECT id, 'charte-demo.pdf', 'demo/absent.pdf', 'application/pdf', 120000, 'Charte graphique (démo)', 'client'
FROM clients WHERE short_name = 'Ti Kaz' AND NOT EXISTS (SELECT 1 FROM client_files f WHERE f.label = 'Charte graphique (démo)');

COMMIT;
