-- Migración: franjas horarias de atención del tenant
-- Ejecutar en entornos existentes que ya tienen el schema base.

CREATE TABLE IF NOT EXISTS business_hours (
  id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  tenant_id   VARCHAR(36)  NOT NULL,
  day_of_week TINYINT      NOT NULL, -- 0=Domingo, 1=Lunes ... 6=Sábado
  is_open     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_day (tenant_id, day_of_week),
  INDEX idx_bh_tenant (tenant_id),
  CONSTRAINT fk_bh_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_hour_slots (
  id               VARCHAR(36) NOT NULL DEFAULT (UUID()),
  tenant_id        VARCHAR(36) NOT NULL,
  business_hour_id VARCHAR(36) NOT NULL,
  open_time        TIME        NOT NULL,
  close_time       TIME        NOT NULL,
  sort_order       TINYINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_bhs_tenant (tenant_id),
  INDEX idx_bhs_hour   (business_hour_id),
  CONSTRAINT fk_bhs_tenant FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_bhs_hour FOREIGN KEY (business_hour_id)
    REFERENCES business_hours(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
