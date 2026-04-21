-- ============================================================
-- NUBA — Seed de datos demo para desarrollo local
-- ============================================================
-- Ejecutar manualmente: npm run db:seed
-- NO se ejecuta automáticamente en db:reset
--
-- Usuarios creados:
--   nuba@nodoapp.com.ar  / nuba1234   (admin)
--   laura@demo.ar        / super1234  (supervisor)
--   carlos@demo.ar       / mozo1234   (vendedor)
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- Tenant demo
INSERT INTO tenants (id, slug, name, email, plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'demo', 'Demo Local', 'nuba@nodoapp.com.ar', 'pro');

-- Sucursal
INSERT INTO branches (id, tenant_id, name, address, city) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Sucursal Central', 'Av. Corrientes 1234', 'Buenos Aires');

-- Roles
INSERT INTO roles (id, tenant_id, name) VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'supervisor'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'vendedor'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'cliente');

-- Admin local: nuba@nodoapp.com.ar (bcrypt cost 12, password: nuba1234)
INSERT INTO users (id, tenant_id, branch_id, role_id, first_name, last_name, email, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000030',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000020',
   'Nuba', 'Administrador', 'nuba@nodoapp.com.ar',
   '$2b$12$dL/bRghrLO/oN3exNeLbW.3RN59/IbJljC8PKF4.lBaViS/Ho5mRu');

-- Supervisor: laura@demo.ar (bcrypt cost 12, password: super1234)
INSERT INTO users (id, tenant_id, branch_id, role_id, first_name,
  last_name, email, password_hash, is_active) VALUES (
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000021',
  'Laura', 'Gómez', 'laura@demo.ar',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdKMjDnGFvGPi',
  TRUE
);

-- Vendedor: carlos@demo.ar (bcrypt cost 12, password: mozo1234)
INSERT INTO users (id, tenant_id, branch_id, role_id, first_name,
  last_name, email, password_hash, is_active) VALUES (
  '00000000-0000-0000-0000-000000000032',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000022',
  'Carlos', 'Pérez', 'carlos@demo.ar',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdKMjDnGFvGPi',
  TRUE
);

-- Pivot usuarios ↔ sucursal
INSERT INTO user_branches (tenant_id, user_id, branch_id, is_primary) VALUES
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000030',
   '00000000-0000-0000-0000-000000000010', TRUE),
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000031',
   '00000000-0000-0000-0000-000000000010', TRUE),
  ('00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000032',
   '00000000-0000-0000-0000-000000000010', TRUE);

-- Categorías padre
INSERT INTO categories (id, tenant_id, parent_id, name, level, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', NULL, 'Bebidas', 0, 0),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', NULL, 'Comidas', 0, 1),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000001', NULL, 'Postres', 0, 2);

-- Subcategorías
INSERT INTO categories (id, tenant_id, parent_id, name, level, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000040', 'Calientes',   1, 0),
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000040', 'Frías',       1, 1),
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000040', 'Alcohólicas', 1, 2),
  ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'Entradas',    1, 0),
  ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'Principales', 1, 1);

-- Mesas
INSERT INTO tables (id, tenant_id, branch_id, name, capacity) VALUES
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Mesa 1', 4),
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Mesa 2', 2),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Barra',  6);

-- Estados de orden
INSERT INTO order_statuses (id, tenant_id, `key`, label, color, sort_order, triggers_stock, is_terminal) VALUES
  ('00000000-0000-0000-0000-0000000000C0', '00000000-0000-0000-0000-000000000001', 'pending',     'Pendiente',           '#6b7280', 0, FALSE, FALSE),
  ('00000000-0000-0000-0000-0000000000C1', '00000000-0000-0000-0000-000000000001', 'in_progress', 'En cocina',           '#f59e0b', 1, FALSE, FALSE),
  ('00000000-0000-0000-0000-0000000000C2', '00000000-0000-0000-0000-000000000001', 'ready',       'Listo para entregar', '#3b82f6', 2, FALSE, FALSE),
  ('00000000-0000-0000-0000-0000000000C3', '00000000-0000-0000-0000-000000000001', 'delivered',   'Entregado',           '#10b981', 3, TRUE,  FALSE),
  ('00000000-0000-0000-0000-0000000000C4', '00000000-0000-0000-0000-000000000001', 'closed',      'Cerrado y pagado',    '#8b5cf6', 4, FALSE, TRUE),
  ('00000000-0000-0000-0000-0000000000C5', '00000000-0000-0000-0000-000000000001', 'cancelled',   'Cancelado',           '#ef4444', 5, FALSE, TRUE);

-- Locations (canales de venta)
INSERT INTO locations (id, tenant_id, branch_id, table_id, type, name, capacity, is_reservable, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000D0', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000050', 'table',    'Mesa 1',    4,    TRUE,  0),
  ('00000000-0000-0000-0000-0000000000D1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000051', 'table',    'Mesa 2',    2,    TRUE,  1),
  ('00000000-0000-0000-0000-0000000000D2', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000052', 'table',    'Barra',     6,    FALSE, 2),
  ('00000000-0000-0000-0000-0000000000D3', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', NULL,                                    'takeaway', 'Take away', NULL, FALSE, 3),
  ('00000000-0000-0000-0000-0000000000D4', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', NULL,                                    'delivery', 'Delivery',  NULL, FALSE, 4);

-- Feature flags
INSERT INTO feature_flags (tenant_id, flag_key, is_enabled) VALUES
  ('00000000-0000-0000-0000-000000000001', 'enable_tables',           TRUE),
  ('00000000-0000-0000-0000-000000000001', 'enable_takeaway',         TRUE),
  ('00000000-0000-0000-0000-000000000001', 'enable_delivery',         FALSE),
  ('00000000-0000-0000-0000-000000000001', 'enable_reservations',     TRUE),
  ('00000000-0000-0000-0000-000000000001', 'enable_mercadopago',      FALSE),
  ('00000000-0000-0000-0000-000000000001', 'enable_kitchen_display',  FALSE),
  ('00000000-0000-0000-0000-000000000001', 'enable_split_bill',       FALSE),
  ('00000000-0000-0000-0000-000000000001', 'enable_tips',             FALSE),
  ('00000000-0000-0000-0000-000000000001', 'enable_holiday_blocking', FALSE);

-- Permisos del rol admin
INSERT IGNORE INTO permissions (id, tenant_id, role_id, resource, can_view, can_create, can_edit, can_delete) VALUES
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'metricas',       TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'productos',      TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'mesas',          TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'clientes',       TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'usuarios',       TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000065', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'administracion', TRUE, TRUE, TRUE, TRUE);

-- Asignar productos existentes a la sucursal central
INSERT IGNORE INTO branch_products (tenant_id, branch_id, product_id)
SELECT p.tenant_id, b.id, p.id
FROM products p
JOIN branches b ON b.tenant_id = p.tenant_id
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001';

SET FOREIGN_KEY_CHECKS = 1;
