-- ============================================================
-- NUBA — Schema MySQL 8.0
-- Archivo: docker/mysql/init/01_schema.sql
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- TENANTS
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  slug          VARCHAR(100)  NOT NULL UNIQUE,        -- el tenantId de la URL
  name          VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  phone         VARCHAR(50)   NULL,
  logo_url      TEXT          NULL,
  plan          ENUM('free','starter','pro','enterprise') NOT NULL DEFAULT 'free',
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- FEATURE FLAGS (por tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  flag_key      VARCHAR(100)  NOT NULL,               -- ej: 'enable_reservations'
  is_enabled    BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_flag (tenant_id, flag_key),
  CONSTRAINT fk_ff_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  name          ENUM('admin','supervisor','vendedor','cliente') NOT NULL,
  description   VARCHAR(255)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_role (tenant_id, name),
  CONSTRAINT fk_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PERMISSIONS (por rol)
-- ============================================================

CREATE TABLE IF NOT EXISTS permissions (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  role_id       VARCHAR(36)   NOT NULL,
  resource      VARCHAR(100)  NOT NULL,               -- ej: 'productos', 'mesas', 'metricas'
  can_view      BOOLEAN       NOT NULL DEFAULT FALSE,
  can_create    BOOLEAN       NOT NULL DEFAULT FALSE,
  can_edit      BOOLEAN       NOT NULL DEFAULT FALSE,
  can_delete    BOOLEAN       NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_resource (role_id, resource),
  CONSTRAINT fk_perm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_perm_role   FOREIGN KEY (role_id)   REFERENCES roles(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BRANCHES (sucursales)
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  name          VARCHAR(255)  NOT NULL,
  address       TEXT          NOT NULL,
  city          VARCHAR(100)  NULL,
  province      VARCHAR(100)  NULL,
  phone         VARCHAR(50)   NULL,
  email         VARCHAR(255)  NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_branches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  branch_id     VARCHAR(36)   NULL,
  role_id       VARCHAR(36)   NOT NULL,
  first_name    VARCHAR(100)  NOT NULL,
  last_name     VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  phone         VARCHAR(50)   NULL,
  avatar_url    TEXT          NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  last_login_at DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_email (tenant_id, email),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id)  REFERENCES tenants(id)  ON DELETE CASCADE,
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id)  REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_role   FOREIGN KEY (role_id)    REFERENCES roles(id)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CUSTOMERS (clientes del tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  branch_id     VARCHAR(36)   NULL,
  first_name    VARCHAR(100)  NOT NULL,
  last_name     VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NULL,
  whatsapp      VARCHAR(50)   NULL,
  phone         VARCHAR(50)   NULL,
  dni           VARCHAR(20)   NULL,
  birthdate     DATE          NULL,
  notes         TEXT          NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_customers_tenant (tenant_id),
  CONSTRAINT fk_customers_tenant FOREIGN KEY (tenant_id)  REFERENCES tenants(id)  ON DELETE CASCADE,
  CONSTRAINT fk_customers_branch FOREIGN KEY (branch_id)  REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CATEGORIES (categorías de productos)
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  parent_id     VARCHAR(36)   NULL,
  name          VARCHAR(100)  NOT NULL,
  description   TEXT          NULL,
  image_url     TEXT          NULL,
  sort_order    INT           NOT NULL DEFAULT 0,
  level         TINYINT       NOT NULL DEFAULT 0,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_categories_tenant (tenant_id),
  INDEX idx_categories_parent (tenant_id, parent_id),
  CONSTRAINT fk_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_category_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unidad de medida (ingredientes, recetas, ítems de receta, porción de producto)
-- ml, l, g, kg, u, porciones

-- ============================================================
-- RECIPES (recetas / sub-recetas reutilizables)
-- ============================================================

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

-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id              VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  tenant_id       VARCHAR(36)     NOT NULL,
  branch_id       VARCHAR(36)     NULL,
  category_id     VARCHAR(36)     NULL,
  recipe_id       VARCHAR(36)     NULL,
  name            VARCHAR(255)    NOT NULL,
  description     TEXT            NULL,
  image_url       TEXT            NULL,
  sku             VARCHAR(100)    NULL,
  price           DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  discount_price  DECIMAL(12,2)   NULL,
  stock           INT             NOT NULL DEFAULT 0,
  track_stock     BOOLEAN         NOT NULL DEFAULT TRUE,
  stock_alert_threshold INT       NULL,
  portion_size    DECIMAL(12,4)   NOT NULL DEFAULT 1.0000,
  portion_unit    ENUM('ml','l','g','kg','u','porciones') NULL,
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_sku (tenant_id, sku),
  INDEX idx_products_tenant   (tenant_id),
  INDEX idx_products_category (category_id),
  INDEX idx_products_recipe   (recipe_id),
  CONSTRAINT fk_products_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenants(id)    ON DELETE CASCADE,
  CONSTRAINT fk_products_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id)   ON DELETE SET NULL,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_recipe   FOREIGN KEY (recipe_id)   REFERENCES recipes(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PRODUCT VARIANTS (variaciones: talle, color, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS product_variants (
  id            VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)     NOT NULL,
  product_id    VARCHAR(36)     NOT NULL,
  name          VARCHAR(100)    NOT NULL,               -- ej: 'Talle M - Rojo'
  sku           VARCHAR(100)    NULL,
  price         DECIMAL(12,2)   NULL,                  -- NULL = hereda del producto
  stock         INT             NOT NULL DEFAULT 0,
  is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_variants_product (product_id),
  CONSTRAINT fk_variants_tenant  FOREIGN KEY (tenant_id)  REFERENCES tenants(id)  ON DELETE CASCADE,
  CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SUPPLIERS (proveedores)
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  name          VARCHAR(255)  NOT NULL,
  contact_name  VARCHAR(255)  NULL,
  email         VARCHAR(255)  NULL,
  phone         VARCHAR(50)   NULL,
  whatsapp      VARCHAR(50)   NULL,
  address       TEXT          NULL,
  notes         TEXT          NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_suppliers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INGREDIENTS (materia prima; stock en unidad mínima, costo por unidad mínima)
-- ============================================================

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

-- ============================================================
-- RECIPE ITEMS (ingrediente O sub-receta por línea; XOR en CHECK)
-- Descuento de stock al confirmar venta: implementar en aplicación (recursivo
-- por sub-recetas) o vía procedimiento; no en trigger aquí.
-- ============================================================

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

-- ============================================================
-- SUPPLIER PRODUCTS (qué provee cada proveedor y a qué costo)
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_products (
  id            VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)     NOT NULL,
  supplier_id   VARCHAR(36)     NOT NULL,
  product_id    VARCHAR(36)     NOT NULL,
  cost_price    DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  notes         TEXT            NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplier_product (supplier_id, product_id),
  CONSTRAINT fk_sp_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenants(id)   ON DELETE CASCADE,
  CONSTRAINT fk_sp_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_product  FOREIGN KEY (product_id)  REFERENCES products(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLES (mesas del local)
-- ============================================================

CREATE TABLE IF NOT EXISTS tables (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  branch_id     VARCHAR(36)   NULL,
  name          VARCHAR(50)   NOT NULL,               -- ej: 'Mesa 1', 'Barra', 'VIP'
  capacity      INT           NOT NULL DEFAULT 4,
  status        ENUM('disponible','ocupada','reservada','inactiva') NOT NULL DEFAULT 'disponible',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tables_tenant (tenant_id),
  CONSTRAINT fk_tables_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)  ON DELETE CASCADE,
  CONSTRAINT fk_tables_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ORDERS (órdenes / comandas)
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id              VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  tenant_id       VARCHAR(36)     NOT NULL,
  branch_id       VARCHAR(36)     NULL,
  table_id        VARCHAR(36)     NULL,
  customer_id     VARCHAR(36)     NULL,
  user_id         VARCHAR(36)     NULL,               -- vendedor que tomó la orden
  status          ENUM('pendiente','en_proceso','listo','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
  type            ENUM('mesa','takeaway','delivery') NOT NULL DEFAULT 'mesa',
  subtotal        DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  discount        DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  tax             DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  total           DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  notes           TEXT            NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_orders_tenant   (tenant_id),
  INDEX idx_orders_table    (table_id),
  INDEX idx_orders_customer (customer_id),
  CONSTRAINT fk_orders_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenants(id)   ON DELETE CASCADE,
  CONSTRAINT fk_orders_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id)  ON DELETE SET NULL,
  CONSTRAINT fk_orders_table    FOREIGN KEY (table_id)    REFERENCES tables(id)    ON DELETE SET NULL,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_user     FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ORDER ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id            VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)     NOT NULL,
  order_id      VARCHAR(36)     NOT NULL,
  product_id    VARCHAR(36)     NULL,
  variant_id    VARCHAR(36)     NULL,
  name          VARCHAR(255)    NOT NULL,             -- snapshot del nombre al momento de venta
  unit_price    DECIMAL(12,2)   NOT NULL,
  quantity      INT             NOT NULL DEFAULT 1,
  subtotal      DECIMAL(12,2)   NOT NULL,
  notes         TEXT            NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_order_items_order (order_id),
  CONSTRAINT fk_oi_tenant  FOREIGN KEY (tenant_id)  REFERENCES tenants(id)          ON DELETE CASCADE,
  CONSTRAINT fk_oi_order   FOREIGN KEY (order_id)   REFERENCES orders(id)           ON DELETE CASCADE,
  CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id)         ON DELETE SET NULL,
  CONSTRAINT fk_oi_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id              VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  tenant_id       VARCHAR(36)     NOT NULL,
  order_id        VARCHAR(36)     NOT NULL,
  mp_payment_id   VARCHAR(100)    NULL,               -- ID de MercadoPago
  mp_preference_id VARCHAR(100)   NULL,
  method          ENUM('efectivo','mercadopago','tarjeta','transferencia','otro') NOT NULL DEFAULT 'efectivo',
  status          ENUM('pendiente','aprobado','rechazado','cancelado','reembolsado') NOT NULL DEFAULT 'pendiente',
  amount          DECIMAL(12,2)   NOT NULL,
  currency        VARCHAR(10)     NOT NULL DEFAULT 'ARS',
  metadata        JSON            NULL,               -- respuesta completa de MP
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_payments_order    (order_id),
  INDEX idx_payments_mp       (mp_payment_id),
  CONSTRAINT fk_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_order  FOREIGN KEY (order_id)  REFERENCES orders(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MP INTEGRATIONS (una cuenta MP por tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS mp_integrations (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id       VARCHAR(36)   NOT NULL UNIQUE,
  access_token    TEXT          NOT NULL,
  refresh_token   TEXT          NULL,
  public_key      VARCHAR(255)  NULL,
  mp_user_id      VARCHAR(100)  NULL,
  expires_at      DATETIME      NULL,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_mp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- RESERVATIONS (reservas de mesas)
-- ============================================================

CREATE TABLE IF NOT EXISTS reservations (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  branch_id     VARCHAR(36)   NULL,
  table_id      VARCHAR(36)   NULL,
  customer_id   VARCHAR(36)   NULL,
  customer_name VARCHAR(255)  NOT NULL,               -- nombre aunque no sea cliente registrado
  customer_phone VARCHAR(50)  NULL,
  party_size    INT           NOT NULL DEFAULT 2,
  date          DATE          NOT NULL,
  time          TIME          NOT NULL,
  duration_min  INT           NOT NULL DEFAULT 90,
  status        ENUM('pendiente','confirmada','cancelada','completada','no_show') NOT NULL DEFAULT 'pendiente',
  notes         TEXT          NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_reservations_tenant (tenant_id),
  INDEX idx_reservations_date   (date),
  CONSTRAINT fk_res_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenants(id)   ON DELETE CASCADE,
  CONSTRAINT fk_res_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id)  ON DELETE SET NULL,
  CONSTRAINT fk_res_table    FOREIGN KEY (table_id)    REFERENCES tables(id)    ON DELETE SET NULL,
  CONSTRAINT fk_res_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  user_id       VARCHAR(36)   NULL,                   -- NULL = para todos los del tenant
  type          ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
  title         VARCHAR(255)  NOT NULL,
  body          TEXT          NULL,
  link          VARCHAR(500)  NULL,
  is_read       BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_notifications_tenant (tenant_id),
  INDEX idx_notifications_user   (user_id),
  CONSTRAINT fk_notif_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED: tenant de prueba para desarrollo local
-- ============================================================

INSERT INTO tenants (id, slug, name, email, plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'demo', 'Demo Local', 'nuba@nodoapp.com.ar', 'pro');

INSERT INTO branches (id, tenant_id, name, address, city) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Sucursal Central', 'Av. Corrientes 1234', 'Buenos Aires');

INSERT INTO roles (id, tenant_id, name) VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'supervisor'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'vendedor'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', 'cliente');

-- Admin local: nuba@nodoapp.com.ar (bcrypt cost 12)
INSERT INTO users (id, tenant_id, branch_id, role_id, first_name, last_name, email, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000030',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000020',
   'Nuba', 'Administrador', 'nuba@nodoapp.com.ar',
   '$2b$12$dL/bRghrLO/oN3exNeLbW.3RN59/IbJljC8PKF4.lBaViS/Ho5mRu');

-- Categorías jerárquicas (solo 1 nivel: padre → hijo; más niveles se validan en app)
INSERT INTO categories (id, tenant_id, parent_id, name, level, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', NULL, 'Bebidas', 0, 0),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', NULL, 'Comidas', 0, 1),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000001', NULL, 'Postres', 0, 2);

INSERT INTO categories (id, tenant_id, parent_id, name, level, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000040', 'Calientes', 1, 0),
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000040', 'Frías', 1, 1),
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000040', 'Alcohólicas', 1, 2),
  ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'Entradas', 1, 0),
  ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000041', 'Principales', 1, 1);

INSERT INTO tables (id, tenant_id, branch_id, name, capacity) VALUES
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Mesa 1', 4),
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Mesa 2', 2),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Barra',  6);

INSERT INTO feature_flags (tenant_id, flag_key, is_enabled) VALUES
  ('00000000-0000-0000-0000-000000000001', 'enable_reservations', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'enable_delivery',     FALSE),
  ('00000000-0000-0000-0000-000000000001', 'enable_mercadopago',  FALSE);

INSERT IGNORE INTO permissions (id, tenant_id, role_id, resource, can_view, can_create, can_edit, can_delete) VALUES
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'metricas', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'productos', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'mesas', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'clientes', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'usuarios', TRUE, TRUE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000065', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'administracion', TRUE, TRUE, TRUE, TRUE);

SET FOREIGN_KEY_CHECKS = 1;
