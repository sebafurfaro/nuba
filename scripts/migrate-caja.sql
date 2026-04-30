-- ============================================================
-- MIGRACIÓN: Módulo de Caja
-- Ejecutar en DBeaver o cliente MySQL:
--   SOURCE scripts/migrate-caja.sql;
-- ============================================================

-- A. Snapshot de costo en order_items
ALTER TABLE order_items
  ADD COLUMN unit_cost DECIMAL(12,2) NULL DEFAULT NULL AFTER unit_price;

-- B. Archivado de órdenes
ALTER TABLE orders
  ADD COLUMN archived_at  DATETIME     NULL DEFAULT NULL,
  ADD COLUMN archived_by  VARCHAR(36)  NULL DEFAULT NULL;

-- C. Tabla de cierres de caja
CREATE TABLE IF NOT EXISTS cash_registers (
  id               VARCHAR(36)   NOT NULL,
  tenant_id        VARCHAR(36)   NOT NULL,
  branch_id        VARCHAR(36)   NOT NULL,
  cerrado_por      VARCHAR(36)   NOT NULL,
  fecha_cierre     DATE          NOT NULL,
  total_efectivo   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_mp         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_otros      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_general    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  cantidad_ordenes INT           NOT NULL DEFAULT 0,
  notas            TEXT          NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_cr_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenants(id),
  CONSTRAINT fk_cr_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id),
  CONSTRAINT fk_cr_user     FOREIGN KEY (cerrado_por) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- D. Pivot órdenes ↔ cierre de caja
ALTER TABLE orders
  ADD COLUMN cash_register_id VARCHAR(36) NULL DEFAULT NULL,
  ADD CONSTRAINT fk_order_cash_register
    FOREIGN KEY (cash_register_id) REFERENCES cash_registers(id);

-- E. Índices para performance en reportes
CREATE INDEX idx_orders_archived    ON orders (tenant_id, archived_at);
CREATE INDEX idx_orders_cash_reg    ON orders (cash_register_id);
CREATE INDEX idx_cash_reg_branch    ON cash_registers (tenant_id, branch_id, fecha_cierre);
