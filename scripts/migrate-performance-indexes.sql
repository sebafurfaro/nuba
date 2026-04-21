-- ============================================================
-- Performance indexes — Nuba
--
-- Ejecutar:  npm run db:indexes
-- Requiere:  MySQL 8.0+
--
-- Idempotente: MySQL 8.0 aún no soporta `IF NOT EXISTS` en
-- `ADD INDEX` / `DROP INDEX`, por eso usamos procedimientos
-- auxiliares que consultan information_schema.
-- ============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS nuba_add_index$$
CREATE PROCEDURE nuba_add_index(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_cols  VARCHAR(500)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name   = p_table
      AND index_name   = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_cols, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS nuba_drop_index$$
CREATE PROCEDURE nuba_drop_index(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64)
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name   = p_table
      AND index_name   = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` DROP INDEX `', p_index, '`');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

-- ORDERS
CALL nuba_add_index('orders', 'idx_orders_tenant_status',  'tenant_id, status_key');
CALL nuba_add_index('orders', 'idx_orders_tenant_created', 'tenant_id, created_at');
CALL nuba_add_index('orders', 'idx_orders_tenant_type',    'tenant_id, type');

-- PRODUCTS
CALL nuba_add_index('products', 'idx_products_tenant_active',   'tenant_id, is_active');
CALL nuba_add_index('products', 'idx_products_tenant_category', 'tenant_id, category_id');

-- RESERVATIONS
CALL nuba_add_index('reservations', 'idx_reservations_tenant_date',   'tenant_id, date');
CALL nuba_add_index('reservations', 'idx_reservations_tenant_status', 'tenant_id, status');

-- CUSTOMERS
CALL nuba_add_index('customers', 'idx_customers_tenant_email',    'tenant_id, email');
CALL nuba_add_index('customers', 'idx_customers_tenant_whatsapp', 'tenant_id, whatsapp');

-- PAYMENTS
CALL nuba_add_index('payments', 'idx_payments_tenant_status', 'tenant_id, status');

-- NOTIFICATIONS
CALL nuba_add_index('notifications', 'idx_notifications_user_read', 'user_id, is_read, created_at');

-- ============================================================
-- Índices redundantes a eliminar
-- ============================================================

-- tenants: la columna `slug` es UNIQUE (crea el índice `slug`);
-- `idx_slug` es un duplicado no único.
-- IMPORTANTE: NO dropear `slug` — eso eliminaría la unicidad.
CALL nuba_drop_index('tenants', 'idx_slug');

-- tenant_blocked_dates: `uq_tenant_date` ya cubre (tenant_id, date).
CALL nuba_drop_index('tenant_blocked_dates', 'idx_tbd_date');

DROP PROCEDURE nuba_add_index;
DROP PROCEDURE nuba_drop_index;
