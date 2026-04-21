-- ============================================================
-- NUBA — Limpia los datos del tenant demo
-- ============================================================
-- Ejecutar manualmente: npm run db:clean
-- Solo borra datos; NO toca el schema ni otras tablas.
-- Después de limpiar podés volver a cargar con: npm run db:seed
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM tenant_blocked_dates  WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM notifications         WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM payments              WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM order_items           WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM orders                WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM reservations          WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM branch_products       WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM product_variants      WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM supplier_products     WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM recipe_items          WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM recipes               WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM ingredients           WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM products              WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM categories            WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM locations             WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM tables                WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM order_statuses        WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM feature_flags         WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM permissions           WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM suppliers             WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM password_reset_tokens WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM user_branches         WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM users                 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM mp_integrations       WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM branches              WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM roles                 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM tenants               WHERE id        = '00000000-0000-0000-0000-000000000001';

SET FOREIGN_KEY_CHECKS = 1;
