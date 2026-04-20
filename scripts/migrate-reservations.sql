-- Migración: agregar customer_email y created_by a reservations
-- Ejecutar en entornos existentes:
--   npm run db:shell < scripts/migrate-reservations.sql

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NULL
    AFTER customer_phone,
  ADD COLUMN IF NOT EXISTS created_by ENUM('admin','client') NOT NULL DEFAULT 'admin'
    AFTER notes;
