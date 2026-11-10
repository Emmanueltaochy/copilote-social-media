-- Données de démonstration pour le développement local UNIQUEMENT (jamais en production).
-- Clients et personnes fictifs ; toutes les dates sont relatives à now() pour que
-- l'accueil, le calendrier et la file de publication aient toujours quelque chose à montrer.
--   psql "$DATABASE_URL" -f scripts/dev/seed-demo.sql
-- Pré-requis : un premier compte direction créé via /bienvenue.

BEGIN;

-- Équipe
INSERT INTO users (email, name, initials, role, departments) VALUES
  ('lea.demo@taochy.test', 'Léa Hoarau', 'LH', 'equipe', '["social"]'),
  ('kevin.demo@taochy.test', 'Kévin Payet', 'KP', 'equipe', '["social","web"]'),
  ('sarah.demo@taochy.test', 'Sarah Grondin', 'SG', 'equipe', '["social"]')
ON CONFLICT (email) DO NOTHING;

-- Clients (fictifs)
INSERT INTO clients (name, short_name, sector, since, monthly_fee_cents, content_target, shoots_included, hours_sold, departments, project_manager_id)
SELECT * FROM (VALUES
  ('Boulangerie Ti Kaz', 'Ti Kaz', 'Boulangerie', 'Client depuis mars 2026', 45000, 12, 1, 10, '["social"]'::jsonb),
  ('Garage Sud Auto', 'Sud Auto', 'Automobile', 'Client depuis juin 2026', 60000, 16, 2, 14, '["social"]'::jsonb),
  ('Atelier Lagon Spa', 'Lagon Spa', 'Bien-être', 'Client depuis janvier 2026', 45000, 10, 1, 9, '["social","web"]'::jsonb),
  ('Les Jardins du Volcan', 'Jardins', 'Paysagiste', 'Client depuis septembre 2026', 30000, 8, 1, 7, '["social"]'::jsonb),
  ('Studio Kréol Fit', 'Kréol Fit', 'Salle de sport', 'Client depuis août 2026', 45000, 12, 1, 10, '["social"]'::jsonb)
) AS v(name, short_name, sector, since, fee, target, shoots, hours, deps)
CROSS JOIN LATERAL (SELECT id FROM users WHERE email = 'lea.demo@taochy.test') pm
ON CONFLICT (name) DO NOTHING;

-- Lignes de contrat
INSERT INTO contract_lines (client_id, label, monthly_target, kind, network, position)
SELECT c.id, l.label, l.n, l.kind::content_kind, l.net::network, l.pos
FROM clients c
JOIN (VALUES
  ('Ti Kaz', 'Posts feed', 6, 'feed', 'instagram', 0), ('Ti Kaz', 'Reels', 4, 'reel', 'instagram', 1), ('Ti Kaz', 'Stories', 2, 'story', 'instagram', 2),
  ('Sud Auto', 'Reels atelier', 8, 'reel', 'tiktok', 0), ('Sud Auto', 'Posts Facebook', 8, 'feed', 'facebook', 1),
  ('Lagon Spa', 'Carrousels', 4, 'carrousel', 'instagram', 0), ('Lagon Spa', 'Reels', 6, 'reel', 'instagram', 1),
  ('Jardins', 'Avant / après', 8, 'feed', 'facebook', 0),
  ('Kréol Fit', 'Reels coaching', 8, 'reel', 'instagram', 0), ('Kréol Fit', 'Posts LinkedIn', 4, 'feed', 'linkedin', 1)
) AS l(client, label, n, kind, net, pos) ON l.client = c.short_name
WHERE NOT EXISTS (SELECT 1 FROM contract_lines x WHERE x.client_id = c.id);

-- Contenus : publiés ce mois, programmés à venir, en cours, en validation, en retard
WITH team AS (SELECT array_agg(id) ids FROM users WHERE role IN ('direction','equipe')),
spec(client, title, kind, net, status, offset_h, caption) AS (VALUES
  ('Ti Kaz', 'Fournée du matin', 'reel', 'instagram', 'publie', -200, '5 h du matin, le premier pain sort du four.'),
  ('Ti Kaz', 'Le bouchon maison', 'feed', 'instagram', 'publie', -150, 'Notre bouchon, recette de la grand-mère.'),
  ('Ti Kaz', 'Galette des rois en avance', 'carrousel', 'instagram', 'pret', 20, 'Les commandes sont ouvertes.'),
  ('Ti Kaz', 'Coulisses du pétrin', 'reel', 'instagram', 'validation', 44, 'Ce que vous ne voyez jamais.'),
  ('Ti Kaz', 'Story horaires du dimanche', 'story', 'instagram', 'creation', 70, NULL),
  ('Sud Auto', 'Vidange en 60 secondes', 'reel', 'tiktok', 'publie', -120, 'On vous montre tout.'),
  ('Sud Auto', 'Avis client du mois', 'feed', 'facebook', 'publie', -60, 'Merci Jean-Marc !'),
  ('Sud Auto', 'Pneus : quand les changer ?', 'reel', 'tiktok', 'pret', 5, '3 signes qui ne trompent pas.'),
  ('Sud Auto', 'Promo climatisation', 'feed', 'facebook', 'validation', 30, 'L''été arrive.'),
  ('Sud Auto', 'Diagnostic électronique', 'reel', 'tiktok', 'revision', 52, NULL),
  ('Sud Auto', 'Le garage de nuit', 'reel', 'tiktok', 'pret', -6, 'Quand tout le monde dort.'),
  ('Lagon Spa', 'Rituel au monoï', 'reel', 'instagram', 'publie', -90, 'Une heure pour soi.'),
  ('Lagon Spa', '5 gestes avant de dormir', 'carrousel', 'instagram', 'validation', 26, 'À garder pour ce soir.'),
  ('Lagon Spa', 'Carte cadeau de fin d''année', 'feed', 'instagram', 'pret', 96, 'L''idée qui fait toujours plaisir.'),
  ('Lagon Spa', 'Visite de la cabine duo', 'reel', 'instagram', 'derush', 120, NULL),
  ('Jardins', 'Avant / après Saint-Gilles', 'feed', 'facebook', 'publie', -30, 'Trois jours de chantier.'),
  ('Jardins', 'Taille des palmiers', 'feed', 'facebook', 'brief', 140, NULL),
  ('Jardins', 'Arrosage malin en saison sèche', 'carrousel', 'facebook', 'idee', NULL, NULL),
  ('Kréol Fit', 'Séance HIIT en 30 secondes', 'reel', 'instagram', 'publie', -100, 'Prêt ?'),
  ('Kréol Fit', 'Le coach répond', 'reel', 'instagram', 'pret', 3, 'Vos questions, ses réponses.'),
  ('Kréol Fit', 'Recrutement coach', 'feed', 'linkedin', 'validation', 48, 'On agrandit l''équipe.'),
  ('Kréol Fit', 'Défi de décembre', 'reel', 'instagram', 'tournage', 160, NULL),
  ('Kréol Fit', 'Témoignage adhérente', 'reel', 'instagram', 'pret', -20, 'Six mois plus tard.')
)
INSERT INTO contents (client_id, title, kind, network, status, caption, scheduled_at, published_at, owner_id, submitted_at)
SELECT c.id, s.title, s.kind::content_kind, s.net::network, s.status::content_status, s.caption,
  CASE WHEN s.offset_h IS NULL THEN NULL ELSE date_trunc('hour', now()) + make_interval(hours => s.offset_h) END,
  CASE WHEN s.status = 'publie' THEN date_trunc('hour', now()) + make_interval(hours => s.offset_h) END,
  (SELECT ids[1 + (abs(hashtext(s.title)) % array_length(ids, 1))] FROM team),
  CASE WHEN s.status = 'validation' THEN now() - interval '2 days' END
FROM spec s JOIN clients c ON c.short_name = s.client
WHERE NOT EXISTS (SELECT 1 FROM contents x WHERE x.client_id = c.id AND x.title = s.title);

-- Tournages
INSERT INTO shoots (client_id, title, place, starts_at, ends_at, status)
SELECT c.id, s.title, s.place, date_trunc('day', now()) + make_interval(days => s.d, hours => s.h),
  date_trunc('day', now()) + make_interval(days => s.d, hours => s.h + 2), s.st::shoot_status
FROM (VALUES
  ('Kréol Fit', 'Défi de décembre', 'Saint-Pierre', 1, 9, 'confirme'),
  ('Lagon Spa', 'Cabine duo et soins', 'Saint-Leu', 3, 14, 'a_securiser'),
  ('Sud Auto', 'Atelier de nuit', 'Le Tampon', 6, 19, 'preparation')
) AS s(client, title, place, d, h, st) JOIN clients c ON c.short_name = s.client
WHERE NOT EXISTS (SELECT 1 FROM shoots x WHERE x.client_id = c.id AND x.title = s.title);

-- Campagne
INSERT INTO campaigns (client_id, name, platform, status, starts_on, ends_on, budget_cents, target_cpl_cents)
SELECT c.id, 'Clim été', 'Meta', 'active', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date, 60000, 800
FROM clients c WHERE c.short_name = 'Sud Auto'
  AND NOT EXISTS (SELECT 1 FROM campaigns x WHERE x.client_id = c.id);

-- Journal d'activité
INSERT INTO activity (client_id, actor_id, actor_label, text, created_at)
SELECT c.id, u.id, NULL, a.txt, now() - make_interval(mins => a.m)
FROM (VALUES
  ('Sud Auto', 'lea.demo@taochy.test', 'a publié « Avis client du mois »', 25),
  ('Ti Kaz', 'kevin.demo@taochy.test', 'a envoyé « Coulisses du pétrin » en validation', 130),
  ('Lagon Spa', 'sarah.demo@taochy.test', 'a importé 24 photos du tournage', 300),
  ('Kréol Fit', 'lea.demo@taochy.test', 'a confirmé le tournage « Défi de décembre »', 520),
  ('Jardins', 'kevin.demo@taochy.test', 'a créé le brief « Taille des palmiers »', 800)
) AS a(client, email, txt, m)
JOIN clients c ON c.short_name = a.client JOIN users u ON u.email = a.email
WHERE NOT EXISTS (SELECT 1 FROM activity x WHERE x.text = a.txt);

COMMIT;
