-- Idempotente: crea `order_statuses` y sembrá el pipeline por defecto en cada tenant
-- que aún no tenga esas claves (corrige: Table 'nuba.order_statuses' doesn't exist).
--
-- Requiere `tenants`.
--
-- Uso:
--   npm run db:migrate-order-statuses
--   o: docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -unuba_user -pnuba_pass nuba < scripts/migrate-order-statuses-table.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS order_statuses (
  id              VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  tenant_id       VARCHAR(36)  NOT NULL,
  `key`           VARCHAR(50)  NOT NULL,
  label           VARCHAR(100) NOT NULL,
  color           VARCHAR(7)   NOT NULL DEFAULT '#6b7280',
  sort_order      INT          NOT NULL DEFAULT 0,
  triggers_stock  BOOLEAN      NOT NULL DEFAULT FALSE,
  is_terminal     BOOLEAN      NOT NULL DEFAULT FALSE,
  is_cancellable  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_status_key (tenant_id, `key`),
  INDEX idx_order_statuses_tenant (tenant_id),
  CONSTRAINT fk_os_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pipeline por defecto (mismos labels que el seed demo del repo)
INSERT INTO order_statuses (id, tenant_id, `key`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable)
SELECT UUID(), t.id, 'pending', 'Pendiente', '#6b7280', 0, FALSE, FALSE, TRUE
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM order_statuses os WHERE os.tenant_id = t.id AND os.`key` = 'pending');

INSERT INTO order_statuses (id, tenant_id, `key`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable)
SELECT UUID(), t.id, 'in_progress', 'En cocina', '#f59e0b', 1, FALSE, FALSE, TRUE
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM order_statuses os WHERE os.tenant_id = t.id AND os.`key` = 'in_progress');

INSERT INTO order_statuses (id, tenant_id, `key`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable)
SELECT UUID(), t.id, 'ready', 'Listo para entregar', '#3b82f6', 2, FALSE, FALSE, TRUE
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM order_statuses os WHERE os.tenant_id = t.id AND os.`key` = 'ready');

INSERT INTO order_statuses (id, tenant_id, `key`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable)
SELECT UUID(), t.id, 'delivered', 'Entregado', '#10b981', 3, TRUE, FALSE, TRUE
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM order_statuses os WHERE os.tenant_id = t.id AND os.`key` = 'delivered');

INSERT INTO order_statuses (id, tenant_id, `key`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable)
SELECT UUID(), t.id, 'closed', 'Cerrado y pagado', '#8b5cf6', 4, FALSE, TRUE, TRUE
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM order_statuses os WHERE os.tenant_id = t.id AND os.`key` = 'closed');

INSERT INTO order_statuses (id, tenant_id, `key`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable)
SELECT UUID(), t.id, 'cancelled', 'Cancelado', '#ef4444', 5, FALSE, TRUE, TRUE
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM order_statuses os WHERE os.tenant_id = t.id AND os.`key` = 'cancelled');

-- Si `orders` no tiene columna `status_key` (error en JOIN con order_statuses), correr después:
--   npm run db:migrate-orders-status-key
