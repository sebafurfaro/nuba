-- Migration: tenant_blocked_dates + enable_holiday_blocking flag
-- Run this on existing databases (db:reset handles it via 01_schema.sql)

CREATE TABLE IF NOT EXISTS tenant_blocked_dates (
  id           VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  tenant_id    VARCHAR(36)  NOT NULL,
  date         DATE         NOT NULL,
  reason       ENUM('feriado','manual') NOT NULL DEFAULT 'feriado',
  holiday_name VARCHAR(255) NULL,
  holiday_type VARCHAR(100) NULL,
  is_unlocked  BOOLEAN      NOT NULL DEFAULT FALSE,
  unlocked_at  DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_date (tenant_id, date),
  INDEX idx_tbd_tenant (tenant_id),
  INDEX idx_tbd_date   (tenant_id, date),
  CONSTRAINT fk_tbd_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add flag to all existing tenants (disabled by default)
INSERT IGNORE INTO feature_flags (tenant_id, flag_key, is_enabled)
SELECT id, 'enable_holiday_blocking', FALSE
FROM tenants;
