-- Idempotente: agrega `location_id` (y `table_id` si falta) en `orders`
-- para alinear con `docker/mysql/init/01_schema.sql` y con `src/lib/db/orders.ts`.
--
-- Corrige: Unknown column 'o.location_id' in 'where clause'
-- (bases donde corrió solo parte de migraciones o `orders` es anterior a ubicaciones).
--
-- Requiere:
--   - Tabla `orders` existente
--   - Tabla `locations` (correr antes `npm run db:migrate-locations` si hace falta)
--
-- Uso:
--   npm run db:migrate-orders-location
--   o: docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -unuba_user -pnuba_pass nuba < scripts/migrate-orders-location-columns.sql

SET NAMES utf8mb4;

-- ---------- location_id ----------
SET @db := DATABASE();
SET @exist_loc := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'location_id'
);
SET @sql_loc := IF(
  @exist_loc = 0,
  'ALTER TABLE orders ADD COLUMN location_id VARCHAR(36) NULL COMMENT ''Punto de atención / canal''',
  'SELECT ''orders.location_id ya existe'' AS msg'
);
PREPARE stmt_loc FROM @sql_loc;
EXECUTE stmt_loc;
DEALLOCATE PREPARE stmt_loc;

-- ---------- table_id ----------
SET @exist_tbl := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'table_id'
);
SET @sql_tbl := IF(
  @exist_tbl = 0,
  'ALTER TABLE orders ADD COLUMN table_id VARCHAR(36) NULL COMMENT ''Mesa física (opcional)''',
  'SELECT ''orders.table_id ya existe'' AS msg'
);
PREPARE stmt_tbl FROM @sql_tbl;
EXECUTE stmt_tbl;
DEALLOCATE PREPARE stmt_tbl;

-- ---------- índice location_id ----------
SET @exist_idx_loc := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_location'
);
SET @sql_idx_loc := IF(
  @exist_idx_loc = 0,
  'CREATE INDEX idx_orders_location ON orders (location_id)',
  'SELECT ''idx_orders_location ya existe'' AS msg'
);
PREPARE stmt_idx_loc FROM @sql_idx_loc;
EXECUTE stmt_idx_loc;
DEALLOCATE PREPARE stmt_idx_loc;

-- ---------- índice table_id ----------
SET @exist_idx_tbl := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_table'
);
SET @sql_idx_tbl := IF(
  @exist_idx_tbl = 0,
  'CREATE INDEX idx_orders_table ON orders (table_id)',
  'SELECT ''idx_orders_table ya existe'' AS msg'
);
PREPARE stmt_idx_tbl FROM @sql_idx_tbl;
EXECUTE stmt_idx_tbl;
DEALLOCATE PREPARE stmt_idx_tbl;

-- ---------- FK location_id → locations (si no existe) ----------
SET @exist_fk_loc := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_location'
);
SET @sql_fk_loc := IF(
  @exist_fk_loc = 0,
  'ALTER TABLE orders ADD CONSTRAINT fk_orders_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL',
  'SELECT ''fk_orders_location ya existe'' AS msg'
);
PREPARE stmt_fk_loc FROM @sql_fk_loc;
EXECUTE stmt_fk_loc;
DEALLOCATE PREPARE stmt_fk_loc;

-- ---------- FK table_id → tables (si no existe) ----------
SET @exist_fk_tbl := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @db AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_table'
);
SET @sql_fk_tbl := IF(
  @exist_fk_tbl = 0,
  'ALTER TABLE orders ADD CONSTRAINT fk_orders_table FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL',
  'SELECT ''fk_orders_table ya existe'' AS msg'
);
PREPARE stmt_fk_tbl FROM @sql_fk_tbl;
EXECUTE stmt_fk_tbl;
DEALLOCATE PREPARE stmt_fk_tbl;
