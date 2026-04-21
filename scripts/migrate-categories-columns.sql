-- Idempotente: agrega columnas que el app Nuba espera en `categories` si faltan.
-- Usá esto si ves: Unknown column 'parent_id' in 'field list'
-- (p. ej. base creada antes de jerarquía / columnas nuevas).
--
-- Uso:
--   npm run db:migrate-categories
--   o: docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -unuba_user -pnuba_pass nuba < scripts/migrate-categories-columns.sql

SET NAMES utf8mb4;

SET @db := DATABASE();

-- parent_id
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'parent_id'
);
SET @sql := IF(@exists = 0, 'ALTER TABLE categories ADD COLUMN parent_id VARCHAR(36) NULL', 'SELECT 1 AS _skip');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- level
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'level'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE categories ADD COLUMN level TINYINT NOT NULL DEFAULT 0',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- description
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'description'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE categories ADD COLUMN description TEXT NULL',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- image_url
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'image_url'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE categories ADD COLUMN image_url TEXT NULL',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- is_active
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'is_active'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE categories ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sort_order
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'sort_order'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE categories ADD COLUMN sort_order INT NOT NULL DEFAULT 0',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
