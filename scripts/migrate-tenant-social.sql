-- Migración: agregar columnas de redes sociales y banner a tenants
-- Ejecutar en entornos existentes:
--   npm run db:shell < scripts/migrate-tenant-social.sql

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tiktok     VARCHAR(100) NULL AFTER instagram,
  ADD COLUMN IF NOT EXISTS youtube    VARCHAR(255) NULL AFTER tiktok,
  ADD COLUMN IF NOT EXISTS banner_url TEXT         NULL AFTER logo_url;
