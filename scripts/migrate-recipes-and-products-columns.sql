-- Idempotente: crea tablas de recetas/ingredientes si faltan y alinea `products` con el esquema actual.
-- Síntomas: POST /api/.../productos → 500; servidor: Unknown column 'recipe_id'… o Table 'nuba.recipes' doesn't exist.
--
-- Uso:
--   npm run db:migrate-recipes-products
--   o: docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -unuba_user -pnuba_pass nuba < scripts/migrate-recipes-and-products-columns.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS recipes (
  id                VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  tenant_id         VARCHAR(36)     NOT NULL,
  name              VARCHAR(255)    NOT NULL,
  description       TEXT            NULL,
  yield_quantity    DECIMAL(12,4)   NOT NULL DEFAULT 1.0000,
  yield_unit        ENUM('ml','l','g','kg','u','porciones') NOT NULL DEFAULT 'porciones',
  is_sub_recipe     BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_recipes_tenant (tenant_id),
  CONSTRAINT fk_recipes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingredients (
  id                      VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  tenant_id               VARCHAR(36)     NOT NULL,
  branch_id               VARCHAR(36)     NULL,
  name                    VARCHAR(255)    NOT NULL,
  unit                    ENUM('ml','l','g','kg','u','porciones') NOT NULL,
  unit_cost               DECIMAL(12,4)   NOT NULL DEFAULT 0.0000,
  stock_quantity          DECIMAL(12,4)   NOT NULL DEFAULT 0.0000,
  stock_alert_threshold   DECIMAL(12,4)   NULL,
  supplier_id             VARCHAR(36)     NULL,
  is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ingredients_tenant (tenant_id),
  INDEX idx_ingredients_branch (branch_id),
  CONSTRAINT fk_ingredients_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenants(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ingredients_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id)   ON DELETE SET NULL,
  CONSTRAINT fk_ingredients_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipe_items (
  id              VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  tenant_id       VARCHAR(36)     NOT NULL,
  recipe_id       VARCHAR(36)     NOT NULL,
  ingredient_id   VARCHAR(36)     NULL,
  sub_recipe_id   VARCHAR(36)     NULL,
  quantity        DECIMAL(12,4)   NOT NULL,
  unit            ENUM('ml','l','g','kg','u','porciones') NOT NULL,
  notes           TEXT            NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_recipe_items_recipe (recipe_id),
  INDEX idx_recipe_items_tenant (tenant_id),
  CONSTRAINT fk_ri_tenant     FOREIGN KEY (tenant_id)     REFERENCES tenants(id)       ON DELETE CASCADE,
  CONSTRAINT fk_ri_recipe     FOREIGN KEY (recipe_id)     REFERENCES recipes(id)       ON DELETE CASCADE,
  CONSTRAINT fk_ri_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ri_sub_recipe FOREIGN KEY (sub_recipe_id) REFERENCES recipes(id)       ON DELETE RESTRICT,
  CONSTRAINT ck_recipe_items_ingredient_xor_subrecipe CHECK (
    (ingredient_id IS NOT NULL AND sub_recipe_id IS NULL)
    OR (ingredient_id IS NULL AND sub_recipe_id IS NOT NULL)
  ),
  CONSTRAINT ck_recipe_items_no_self_subrecipe CHECK (
    sub_recipe_id IS NULL OR sub_recipe_id <> recipe_id
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @db := DATABASE();

-- products.recipe_id
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'recipe_id'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE products ADD COLUMN recipe_id VARCHAR(36) NULL AFTER category_id',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- products.stock_alert_threshold
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'stock_alert_threshold'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE products ADD COLUMN stock_alert_threshold INT NULL AFTER track_stock',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- products.portion_size
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'portion_size'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE products ADD COLUMN portion_size DECIMAL(12,4) NOT NULL DEFAULT 1.0000 AFTER stock_alert_threshold',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- products.portion_unit
SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND COLUMN_NAME = 'portion_unit'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE products ADD COLUMN portion_unit ENUM(''ml'',''l'',''g'',''kg'',''u'',''porciones'') NULL AFTER portion_size',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index idx_products_recipe
SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_recipe'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE products ADD INDEX idx_products_recipe (recipe_id)',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK fk_products_recipe
SET @exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products' AND CONSTRAINT_NAME = 'fk_products_recipe'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE products ADD CONSTRAINT fk_products_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL',
  'SELECT 1 AS _skip'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
