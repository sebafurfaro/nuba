-- Idempotente: agrega `orders.status_key` y alinea valores con el pipeline (`order_statuses`).
--
-- Corrige: Unknown column 'o.status_key' in 'on clause'
-- (tabla `orders` creada antes del modelo con pipeline por `status_key`).
--
-- Requiere:
--   - `tenants`, tabla `orders`
--   - `order_statuses` con claves pending, in_progress, … (correr antes `npm run db:migrate-order-statuses`)
--
-- Uso:
--   npm run db:migrate-order-statuses
--   npm run db:migrate-orders-status-key
--   o: mysql ... < scripts/migrate-orders-status-key.sql

SET NAMES utf8mb4;

SET @db := DATABASE();

-- ---------- status_key ----------
SET @exist_sk := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'status_key'
);
SET @status_key_was_missing := (@exist_sk = 0);
SET @sql_sk := IF(
  @status_key_was_missing,
  'ALTER TABLE orders ADD COLUMN status_key VARCHAR(50) NOT NULL DEFAULT ''pending'' COMMENT ''Clave en order_statuses''',
  'SELECT ''orders.status_key ya existe'' AS msg'
);
PREPARE stmt_sk FROM @sql_sk;
EXECUTE stmt_sk;
DEALLOCATE PREPARE stmt_sk;

-- Backfill solo si recién agregamos la columna (no pisar datos en re-ejecuciones)
SET @exist_st := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'status'
);
SET @sql_bf := IF(
  @status_key_was_missing AND @exist_st > 0,
  'UPDATE orders SET status_key = CASE `status`
     WHEN ''pendiente'' THEN ''pending''
     WHEN ''en_proceso'' THEN ''in_progress''
     WHEN ''listo'' THEN ''ready''
     WHEN ''entregado'' THEN ''delivered''
     WHEN ''cancelado'' THEN ''cancelled''
     ELSE ''pending''
   END',
  'SELECT ''Sin backfill (columna ya existía o no hay orders.status)'' AS msg'
);
PREPARE stmt_bf FROM @sql_bf;
EXECUTE stmt_bf;
DEALLOCATE PREPARE stmt_bf;

-- ---------- índice útil para joins con order_statuses ----------
SET @exist_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_tenant_status_key'
);
SET @sql_idx := IF(
  @exist_idx = 0,
  'CREATE INDEX idx_orders_tenant_status_key ON orders (tenant_id, status_key)',
  'SELECT ''idx_orders_tenant_status_key ya existe'' AS msg'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
