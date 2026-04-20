-- Migración: columnas de perfil del tenant
-- Para entornos existentes: npm run db:shell < scripts/migrate-tenant-profile.sql

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS description  TEXT         NULL AFTER name,
  ADD COLUMN IF NOT EXISTS address      TEXT         NULL AFTER phone,
  ADD COLUMN IF NOT EXISTS city         VARCHAR(100) NULL AFTER address,
  ADD COLUMN IF NOT EXISTS province     VARCHAR(100) NULL AFTER city,
  ADD COLUMN IF NOT EXISTS website      VARCHAR(255) NULL AFTER logo_url,
  ADD COLUMN IF NOT EXISTS instagram    VARCHAR(100) NULL AFTER website,
  ADD COLUMN IF NOT EXISTS facebook     VARCHAR(100) NULL AFTER instagram,
  ADD COLUMN IF NOT EXISTS whatsapp     VARCHAR(50)  NULL AFTER facebook;

-- Feature flags faltantes (idempotente vía INSERT IGNORE)
INSERT IGNORE INTO feature_flags (tenant_id, flag_key, is_enabled)
SELECT t.id, f.flag_key, f.is_enabled
FROM tenants t
CROSS JOIN (
  SELECT 'enable_tables'          AS flag_key, TRUE  AS is_enabled UNION ALL
  SELECT 'enable_takeaway',                    TRUE               UNION ALL
  SELECT 'enable_delivery',                    FALSE              UNION ALL
  SELECT 'enable_reservations',               TRUE               UNION ALL
  SELECT 'enable_mercadopago',                FALSE              UNION ALL
  SELECT 'enable_kitchen_display',            FALSE              UNION ALL
  SELECT 'enable_split_bill',                 FALSE              UNION ALL
  SELECT 'enable_tips',                       FALSE
) f;
