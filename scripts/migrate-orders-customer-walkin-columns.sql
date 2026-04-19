-- Idempotente: agrega datos de cliente “sin registro” en `orders`
-- (`customer_name`, `customer_phone`, `delivery_address`), alineado con
-- `docker/mysql/init/01_schema.sql` y `src/lib/db/orders.ts`.
--
-- Corrige: Unknown column 'customer_name' in 'field list'
--
-- Nota: `customer_id` NULL = sin cliente registrado. Igual el INSERT de la app
-- incluye estas columnas con NULL en salón; MySQL exige que existan en la tabla.
--
-- Uso:
--   npm run db:migrate-orders-customer-walkin
--   o: docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -unuba_user -pnuba_pass nuba < scripts/migrate-orders-customer-walkin-columns.sql

SET NAMES utf8mb4;

SET @db := DATABASE();

-- ---------- customer_name ----------
SET @exist_cn := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'customer_name'
);
SET @sql_cn := IF(
  @exist_cn = 0,
  'ALTER TABLE orders ADD COLUMN customer_name VARCHAR(255) NULL COMMENT ''Take away / delivery sin cliente registrado''',
  'SELECT ''orders.customer_name ya existe'' AS msg'
);
PREPARE stmt_cn FROM @sql_cn;
EXECUTE stmt_cn;
DEALLOCATE PREPARE stmt_cn;

-- ---------- customer_phone ----------
SET @exist_cp := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'customer_phone'
);
SET @sql_cp := IF(
  @exist_cp = 0,
  'ALTER TABLE orders ADD COLUMN customer_phone VARCHAR(50) NULL',
  'SELECT ''orders.customer_phone ya existe'' AS msg'
);
PREPARE stmt_cp FROM @sql_cp;
EXECUTE stmt_cp;
DEALLOCATE PREPARE stmt_cp;

-- ---------- delivery_address ----------
SET @exist_da := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'delivery_address'
);
SET @sql_da := IF(
  @exist_da = 0,
  'ALTER TABLE orders ADD COLUMN delivery_address TEXT NULL',
  'SELECT ''orders.delivery_address ya existe'' AS msg'
);
PREPARE stmt_da FROM @sql_da;
EXECUTE stmt_da;
DEALLOCATE PREPARE stmt_da;
