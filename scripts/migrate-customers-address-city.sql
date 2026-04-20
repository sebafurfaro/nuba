-- Idempotente: columnas `address` y `city` en `customers` (formulario panel).
--
-- Uso:
--   npm run db:migrate-customers-address-city
--   o: docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -unuba_user -pnuba_pass nuba < scripts/migrate-customers-address-city.sql

SET NAMES utf8mb4;

SET @db := DATABASE();

SET @exist_a := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'address'
);
SET @sql_a := IF(
  @exist_a = 0,
  'ALTER TABLE customers ADD COLUMN address VARCHAR(500) NULL',
  'SELECT ''customers.address ya existe'' AS msg'
);
PREPARE stmt_a FROM @sql_a;
EXECUTE stmt_a;
DEALLOCATE PREPARE stmt_a;

SET @exist_c := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'city'
);
SET @sql_c := IF(
  @exist_c = 0,
  'ALTER TABLE customers ADD COLUMN city VARCHAR(120) NULL',
  'SELECT ''customers.city ya existe'' AS msg'
);
PREPARE stmt_c FROM @sql_c;
EXECUTE stmt_c;
DEALLOCATE PREPARE stmt_c;
