-- Migración: agregar columnas de tema de marca a la tabla tenants
-- Compatible con MySQL 8.0

SET @dbname = DATABASE();
SET @tablename = 'tenants';

-- color_primario
SET @col = 'color_primario';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) = 0,
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN color_primario VARCHAR(7) NOT NULL DEFAULT ''#000000'''),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- color_secundario
SET @col = 'color_secundario';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) = 0,
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN color_secundario VARCHAR(7) NOT NULL DEFAULT ''#000000'''),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- color_fondo
SET @col = 'color_fondo';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) = 0,
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN color_fondo VARCHAR(7) NOT NULL DEFAULT ''#ffffff'''),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- color_texto
SET @col = 'color_texto';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) = 0,
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN color_texto VARCHAR(7) NOT NULL DEFAULT ''#000000'''),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- color_links
SET @col = 'color_links';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) = 0,
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN color_links VARCHAR(7) NOT NULL DEFAULT ''#000000'''),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
