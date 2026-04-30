-- ============================================================
-- Migración: estados base de órdenes (Pedido + Pagado)
-- Ejecutar UNA sola vez en Railway MySQL (DBeaver o CLI)
-- ============================================================

-- 1. Insertar estado "Pedido" para todos los tenants activos que no lo tengan
INSERT INTO order_statuses (id, tenant_id, `key`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable)
SELECT
  UUID(),
  t.id,
  'pedido',
  'Pedido',
  '#6b7280',
  0,
  FALSE,
  FALSE,
  TRUE
FROM tenants t
WHERE t.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM order_statuses os
    WHERE os.tenant_id = t.id AND os.`key` = 'pedido'
  );

-- 2. Insertar estado "Pagado" para todos los tenants activos que no lo tengan
INSERT INTO order_statuses (id, tenant_id, `key`, label, color, sort_order, triggers_stock, is_terminal, is_cancellable)
SELECT
  UUID(),
  t.id,
  'pagado',
  'Pagado',
  '#22c55e',
  9999,
  FALSE,
  TRUE,
  FALSE
FROM tenants t
WHERE t.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM order_statuses os
    WHERE os.tenant_id = t.id AND os.`key` = 'pagado'
  );

-- 3. Reparar órdenes huérfanas con status_key = 'pending' (creadas antes del fix)
--    Las mueve a 'pedido' solo si ese estado ya existe para el tenant.
UPDATE orders o
INNER JOIN order_statuses os
  ON os.tenant_id = o.tenant_id AND os.`key` = 'pedido'
SET o.status_key = 'pedido',
    o.status     = 'pendiente',
    o.updated_at = CURRENT_TIMESTAMP
WHERE o.status_key = 'pending';

-- 4. Verificación — debe mostrar 'pedido' y 'pagado' para cada tenant
-- SELECT t.slug, os.`key`, os.label, os.is_terminal, os.sort_order
-- FROM order_statuses os
-- INNER JOIN tenants t ON t.id = os.tenant_id
-- WHERE os.`key` IN ('pedido', 'pagado')
-- ORDER BY t.slug, os.sort_order;
