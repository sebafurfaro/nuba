-- Aplicar sobre una base `nuba` ya existente (no corre en docker-entrypoint-initdb por defecto).
-- Uso: docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -unuba_user -pnuba_pass nuba < scripts/seed-demo-admin.sql
--    o: npm run db:seed

SET NAMES utf8mb4;

UPDATE tenants
SET
  slug = 'demo',
  name = 'Demo Local',
  email = 'nuba@nodoapp.com.ar',
  plan = 'pro'
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE users
SET
  first_name = 'Nuba',
  last_name = 'Administrador',
  email = 'nuba@nodoapp.com.ar',
  password_hash = '$2b$12$dL/bRghrLO/oN3exNeLbW.3RN59/IbJljC8PKF4.lBaViS/Ho5mRu',
  role_id = '00000000-0000-0000-0000-000000000020',
  branch_id = '00000000-0000-0000-0000-000000000010'
WHERE id = '00000000-0000-0000-0000-000000000030';

INSERT IGNORE INTO permissions (id, tenant_id, role_id, resource, can_view, can_create, can_edit, can_delete) VALUES
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'metricas', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'productos', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'mesas', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'clientes', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'usuarios', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000065', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'administracion', TRUE, TRUE, TRUE, TRUE);
