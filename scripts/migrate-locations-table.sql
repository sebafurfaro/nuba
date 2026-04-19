-- Idempotente: crea `locations` (y dependencias mínimas) si faltan.
-- Corregí el error: Table 'nuba.locations' doesn't exist
-- (bases creadas antes de órdenes / ubicaciones por tenant).
--
-- Requiere que exista `tenants` (como en cualquier tenant Nuba).
--
-- Uso:
--   npm run db:migrate-locations
--   o: docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -unuba_user -pnuba_pass nuba < scripts/migrate-locations-table.sql

SET NAMES utf8mb4;

-- Sucursales (FK opcional desde locations / tables / orders)
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

-- Mesas del local (FK opcional desde locations)
CREATE TABLE IF NOT EXISTS tables (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  tenant_id     VARCHAR(36)   NOT NULL,
  branch_id     VARCHAR(36)   NULL,
  name          VARCHAR(50)   NOT NULL,
  capacity      INT           NOT NULL DEFAULT 4,
  status        ENUM('disponible','ocupada','reservada','inactiva') NOT NULL DEFAULT 'disponible',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tables_tenant (tenant_id),
  CONSTRAINT fk_tables_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)  ON DELETE CASCADE,
  CONSTRAINT fk_tables_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Puntos de atención / canales (mesas, mostrador, take away, etc.)
CREATE TABLE IF NOT EXISTS locations (
  id               VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  tenant_id        VARCHAR(36)  NOT NULL,
  branch_id        VARCHAR(36)  NULL,
  table_id         VARCHAR(36)  NULL,
  type             ENUM('table','counter','takeaway','delivery','online')
                   NOT NULL DEFAULT 'table',
  name             VARCHAR(100) NOT NULL,
  capacity         INT          NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  is_reservable    BOOLEAN      NOT NULL DEFAULT FALSE,
  accepts_queue    BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order       INT          NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_locations_tenant (tenant_id),
  INDEX idx_locations_type   (tenant_id, type),
  CONSTRAINT fk_loc_tenant FOREIGN KEY (tenant_id)  REFERENCES tenants(id)  ON DELETE CASCADE,
  CONSTRAINT fk_loc_branch FOREIGN KEY (branch_id)  REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_loc_table  FOREIGN KEY (table_id)   REFERENCES tables(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
