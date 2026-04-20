-- migrate-branch-products.sql
-- Migración para entornos existentes: implementa el Modelo C de productos
-- (catálogo global con asignación por sucursal).
--
-- Uso: npm run db:shell < scripts/migrate-branch-products.sql

-- Paso 1: agregar columna is_global a products (idempotente)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT TRUE
  COMMENT 'TRUE = disponible en todas las sucursales por defecto';

-- Paso 2: marcar como no-global los productos que tenían branch_id
UPDATE products SET is_global = FALSE WHERE branch_id IS NOT NULL;

-- Paso 3: crear tabla branch_products
CREATE TABLE IF NOT EXISTS branch_products (
  id             VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id      VARCHAR(36)   NOT NULL,
  branch_id      VARCHAR(36)   NOT NULL,
  product_id     VARCHAR(36)   NOT NULL,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  price_override DECIMAL(12,2) NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                 ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_branch_product (branch_id, product_id),
  INDEX idx_bp_tenant  (tenant_id),
  INDEX idx_bp_branch  (branch_id),
  INDEX idx_bp_product (product_id),
  CONSTRAINT fk_bp_tenant  FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)   ON DELETE CASCADE,
  CONSTRAINT fk_bp_branch  FOREIGN KEY (branch_id)
    REFERENCES branches(id)  ON DELETE CASCADE,
  CONSTRAINT fk_bp_product FOREIGN KEY (product_id)
    REFERENCES products(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Paso 4: migrar productos que ya tienen branch_id explícito
INSERT IGNORE INTO branch_products (tenant_id, branch_id, product_id, is_active)
SELECT p.tenant_id, p.branch_id, p.id, p.is_active
FROM products p
WHERE p.branch_id IS NOT NULL;

-- Paso 5: productos globales (sin branch_id) → asignarlos a TODAS las
-- sucursales activas del tenant que aún no los tengan registrados
INSERT IGNORE INTO branch_products (tenant_id, branch_id, product_id, is_active)
SELECT p.tenant_id, b.id, p.id, p.is_active
FROM products p
JOIN branches b ON b.tenant_id = p.tenant_id AND b.is_active = TRUE
WHERE p.branch_id IS NULL;
