# Relevamiento y auditoría — Nuba

Plataforma SaaS multi-tenant para gestión gastronómica (Next.js, TypeScript, Tailwind, Hero UI, MySQL, NextAuth v5).

**Alcance:** revisión de estructura, base de datos, tipos, capa `src/lib/db`, API routes, UI, diseño, autenticación, secciones del panel y configuración. No se ejecutaron tests automatizados en esta pasada.

**Fecha de referencia:** abril 2026 (estado del repositorio al momento del último relevamiento).

**Última actualización de este documento:** abril 2026 — incorpora cambios posteriores al relevamiento inicial (capa `lib/db` productos/clientes, webhook MP, scripts Docker, estado real del panel).

---

## 1. Resumen ejecutivo

| Área | Estado aproximado | Comentario breve |
|------|-------------------|------------------|
| Estructura / App Router | ~80% | Buen uso de `[tenantId]` y `(public)`; convivencia `ubicaciones` con el mapa de `.cursorrules`. |
| Base de datos (schema + seed) | ~85% | Modelo coherente y multi-tenant; entornos viejos siguen necesitando scripts en `scripts/` alineados a `01_schema.sql`. |
| Tipos TypeScript | ~68% | Cubren varias entidades; **sigue faltando** `customer.ts` dedicado; naming API mayormente en español bajo `[tenantId]`. |
| Capa `src/lib/db/` | ~85% | `orders`, `recipes`, `order-config`, **`products`**, **`customers`**, **`mp-webhook-payments`**; queries de productos/clientes ya no viven solo en las routes. |
| API `[tenantId]` | ~88% | `getTenantSession` + `auth()`; webhook global MP implementado bajo `api/mp/webhook`. |
| UI / diseño | ~72% | Shell con glass y tokens `--nuba-*`; **`Dialog*` implementados** (Hero UI); varias secciones del panel aún `return null`. |
| Auth / seguridad | ~82% | Middleware en panel + JWT; **webhook MP con firma e idempotencia** (operación end-to-end aún depende de datos en DB y env). |
| Panel por secciones | ~48% | Productos, categorías, mesas/órdenes, ubicaciones, pipeline reales; **clientes, usuarios, sucursales, integraciones UI, proveedores, admin, store** sin pantalla. |
| Config (Tailwind, scripts, Next) | ~75% | Tailwind v4 vía CSS; **`db:up` / `db:down` / `db:logs`** presentes en `package.json`. |

---

## 2. Estructura y arquitectura

### Cumplimientos

- `src/app/[tenantId]/panel/` con layout y rutas por sección.
- `src/app/api/[tenantId]/` como prefijo principal de APIs por tenant.
- `src/app/(public)/` con login, onboarding y página pública por tenant.
- `src/components/layout/` (Aside, Header, NotificationCenter), `src/lib/permissions.ts`, stores en `src/store/`.

### Desvíos respecto a `.cursorrules`

- Ruta **`/panel/ubicaciones`** implementada; no aparece en el mapa de carpetas del documento de reglas (convivencia con `mesas` / operación).
- API de productos en **español** (`productos/`, `costo-comida`); no hay ruta paralela `api/.../products/` en el árbol actual.
- `.cursorrules` menciona helpers JWT en `src/lib/auth.ts` y NextAuth en `src/auth.ts`: en el repo **`src/auth.ts`** expone `auth()` compatible con NextAuth y **`src/lib/auth.ts`** con firma/verificación JWT — coherente pero la redacción de la regla puede confundir.

### `middleware.ts`

- **Ubicación:** `src/middleware.ts`.
- **Panel:** detecta rutas `/{segmento}/panel/...`, exige cookie de sesión, `verifySessionToken`, compara **`session.tenantId`** con el primer segmento de la URL, aplica **`canAccessPanelTrail`** y redirige a login o home del panel.
- **No usa `auth()` de NextAuth dentro del middleware** (usa JWT propio); las API bajo `/api/...` no dependen de este matcher para rutas que no son `*/panel/*`.
- **`matcher`:** amplio; rutas no-panel hacen `NextResponse.next()` de inmediato.

---

## 3. Base de datos (`docker/mysql/init/01_schema.sql`)

### Multi-tenant (`tenant_id`)

- Tablas de negocio (usuarios, clientes, categorías, productos, órdenes, ubicaciones, estados, etc.) incluyen **`tenant_id`** y FK a **`tenants`** donde corresponde.
- **`tenants`** es la tabla raíz (no lleva `tenant_id`).
- **`roles`** y **`permissions`** están modelados **por tenant** (`tenant_id` presente).

### Índices y relaciones

- Índices habituales en `tenant_id`, slugs y claves de join; conviene revisar caso por caso según queries reales en producción (no se perfiló el plan de cada query en esta auditoría).

### Seed de desarrollo

- El `01_schema.sql` incluye inserts de demo (tenant, categorías, productos, órdenes, locations, order_statuses, etc.). Entornos creados antes de ciertas tablas necesitan los scripts en **`scripts/migrate-*.sql`** (locations, order_statuses, categorías, recetas/productos).

---

## 4. Tipos TypeScript (`src/types/`)

**Archivos observados:** `category.ts`, `ingredient.ts`, `order.ts`, `product.ts`, `recipe.ts`, `tenant.ts`, `user.ts`.

- **Huecos:** no hay **`customer.ts`** (datos de cliente: tipos parciales en `src/lib/db/customers.ts` y en respuestas de API).
- **Consistencia API:** rutas bajo **`productos/`** en español; sin duplicado inglés `products/` en API en el estado actual.
- **`any`:** búsqueda puntual sin coincidencias de `: any` / `as any` en `src` (no garantiza ausencia de otros casts laxos).

---

## 5. Capa de datos (`src/lib/db/`)

**Archivos:** `categories.ts`, `order-config.ts`, `orders.ts`, `recipes.ts`, **`products.ts`**, **`customers.ts`**, **`mp-webhook-payments.ts`** (+ `src/lib/db.ts` pool).

| Entidad (checklist) | Estado en `lib/db` |
|---------------------|-------------------|
| products | **`products.ts`** (+ variantes / costo comida vía funciones exportadas) |
| categories | **`categories.ts`** |
| customers | **`customers.ts`** (listado + helpers métricas/favoritos/mes; API panel aún mínima) |
| orders | **`orders.ts`** (+ `closeOrder` con opción **`reusePaymentId`** para webhook MP) |
| locations | **`order-config.ts`** + **`orders.ts`** (`getLocations`) |
| recipes | **`recipes.ts`** |
| ingredients | **`recipes.ts`** / rutas ingredientes |
| pagos / MP webhook | **`mp-webhook-payments.ts`** (búsqueda por `mp_payment_id` / `mp_preference_id`, update idempotente) |

**Observaciones**

- Las queries revisadas en `lib/db` usan **`tenant_id`** en `WHERE` con placeholders (prepared statements).
- **Transacciones:** `beginTransaction` en `orders`, `recipes`, `order-config`, `products` (creación producto / variantes), webhook de variantes, etc.

**Módulos auxiliares MP (fuera de `lib/db`)**

- `src/lib/mp/webhook-signature.ts` — verificación HMAC `x-signature`.
- `src/lib/mp/mercadopago-payment-api.ts` — GET `/v1/payments/{id}`.

---

## 6. API Routes

### Bajo `src/app/api/[tenantId]/`

- Uso de **`getTenantSession`**: `auth()`, validación de slug vs **`session.user.tenantId`**, resolución a **UUID** del tenant en MySQL.
- Gates por rol: **`requireAdminOrSupervisor`**, **`requireOrderStaff`**, **`requireAdmin`** según endpoint.
- **Productos:** orquestación delgada + Zod; lógica SQL en **`@/lib/db/products`**.
- **Clientes:** `GET .../clientes` usa **`getCustomers`** desde `customers.ts`.

### Fuera de `[tenantId]`

- **`src/app/api/mp/webhook/route.ts`:** **implementado** — firma con `MP_WEBHOOK_SECRET`, idempotencia por `mp_payment_id`, actualización de `payments`, cierre de orden con `closeOrder(..., { reusePaymentId })` cuando corresponde; errores de negocio → `console.error` y **200** (salvo **401** si la firma no valida).
- **Nota operativa:** hace falta flujo previo que cree fila en `payments` (p. ej. `pendiente` + `mp_preference_id`) y tokens en **`mp_integrations`** alineados con el cobro.

### APIs stub en raíz (histórico)

- En el estado actual **no** aparecen rutas sueltas tipo `api/mesas` / `api/clientes` sin tenant; el modelo favorece **`/api/[tenantId]/...`**.

---

## 7. Componentes UI y reglas de diseño

### `src/components/ui/`

- **`Dialog.tsx`**, **`DialogInfo.tsx`**, **`DialogSuccess.tsx`**, **`DialogWarning.tsx`:** **implementados** (Hero UI Modal / patrones de confirmación).
- **`confirm-danger-alert.tsx`:** confirmación destructiva (AlertDialog) usada al menos en ubicaciones.

### Prohibidos (alert / confirm / native dialog / iconos / colores)

- **`window.alert` / `confirm` / `prompt`:** sin coincidencias relevantes en búsquedas recientes en `src`.
- **Íconos:** uso predominante de **lucide-react** en el panel revisado.
- **Colores:** tokens `--nuba-*` en `globals.css`; revisar periódicamente badges en mesas/órdenes por alineación con “no hardcodear”.

### Formularios

- **react-hook-form + zod:** bien aplicado en **producto crear** y **categorías**; otras pantallas (mesas, ubicaciones, varios modales) usan estado local y controles nativos.

---

## 8. Autenticación y seguridad

- **Login:** `POST /api/auth/login` con zod, bcrypt y emisión de JWT en cookie.
- **Sesión server:** `src/auth.ts` → `auth()` leyendo cookie y `verifySessionToken`.
- **Panel:** middleware + layout del panel con `getSessionFromCookies` en páginas server donde aplica.
- **Webhook MP:** verificación de origen con secreto de integración; idempotencia en DB; no exponer detalles en respuestas HTTP ante fallos internos (MP reintenta si no hay 200).

---

## 9. Secciones del panel — estado

| Sección | Estado | Notas |
|---------|--------|--------|
| Layout (Aside + Header + notificaciones) | Completo | `PanelLayoutClient`, navegación agrupada, notificaciones placeholder. |
| Métricas / home del panel | Parcial | UI con datos de ejemplo / no conectada a métricas reales (re-auditar si se prioriza). |
| Productos — listado | Completo | |
| Productos — crear | Completo | RHF + zod. |
| Productos — detalle/edición | Parcial | Ruta y API existen; profundidad vs crear no auditada al detalle. |
| Categorías (árbol padre/hijo) | Completo | DnD, modales, API. |
| Recetas e ingredientes | Parcial | Backend sólido; UI panel no auditada exhaustivamente. |
| Mesas/órdenes — mapa | Completo | |
| Mesas/órdenes — kanban | Completo | |
| Mesas/órdenes — drawer | Completo | Incluye cobro/modal. |
| Clientes — listado | **Pendiente UI** | API `GET .../clientes` + `getCustomers`; **`panel/clientes/page.tsx` → `return null`**. |
| Clientes — perfil + métricas | Faltante | Funciones en `customers.ts` sin rutas/UI públicas aún. |
| Usuarios y roles | Faltante | Página `null`. |
| Sucursales | Faltante | Página `null`. |
| Calendario | **Stub actual** | **`panel/calendario/page.tsx` → `return null`**; si se esperaba FullCalendar, recuperar o actualizar roadmap. |
| Proveedores | Faltante | Página `null`. |
| Integraciones (MP) | **Parcial** | Webhook listo; **pantalla `panel/integraciones` → `return null`** (sin UI de configuración). |
| Administración | Faltante | **`panel/administracion/page.tsx` → `return null`** (pipeline de estados sí existe en otras rutas). |
| Pipeline estados de orden | Completo | Panel + APIs. |
| Ubicaciones | Parcial | Listado/alta/baja; no en el mapa original de `.cursorrules`. |
| Store (super-admin) | Faltante | `app/store/page.tsx` → `null`. |

---

## 10. Configuración del proyecto

| Ítem | Estado |
|------|--------|
| `tailwind.config.ts` | No hay archivo raíz; **Tailwind v4** vía `@import "tailwindcss"` y `@theme` / tokens en **`globals.css`**. |
| `globals.css` | Tokens claros/oscuros `--nuba-*` y utilidades alineadas al tema. |
| `.env.local` | Variables sensibles fuera del repo; documentar en README / `.cursorrules` (`MP_WEBHOOK_SECRET`, DB, `AUTH_SECRET`, etc.). |
| `.cursorrules` | Presente en la raíz del proyecto. |
| `package.json` scripts | **`db:up`**, **`db:down`**, **`db:logs`**, `db:reset`, `db:shell`, `db:seed`, migraciones SQL puntuales. |
| `next.config.ts` | Configuración mínima por defecto. |

---

## 11. Problemas críticos (actualizado)

1. ~~**APIs stub en la raíz**~~ → **Superado** en el árbol actual (APIs multi-tenant bajo `[tenantId]`); riesgo residual: **pantallas panel en `null`** sin feedback al usuario.
2. ~~**Componentes `Dialog*` stub**~~ → **Resuelto**.
3. ~~**Webhook Mercado Pago sin lógica**~~ → **Resuelto en código**; **crítico operativo:** secretos, fila `payments` + preferencia, y `mp_integrations` correctos para el tenant.
4. **Bases desactualizadas** respecto al `01_schema.sql` — mitigado con scripts manuales; **sin runner de migraciones integrado** (sigue siendo deuda técnica).

---

## 12. Problemas importantes

1. Desalineación texto **`.cursorrules`** vs ubicación real de **`auth()`** / JWT (documentación, no bloqueo).
2. Formularios no unificados en **RHF + zod** en todo el panel.
3. Confirmaciones destructivas **no unificadas** en todos los flujos (`ConfirmDangerAlert` vs otros modales).
4. ~~Duplicidad rutas API `productos` vs `products`~~ → **Ya no aplica** en el estado actual del repo.
5. **`next.config.ts`** sigue mínimo; valorar headers de seguridad / imágenes según deploy.
6. **Tipos de dominio `customer`** ausentes en `src/types/`.

---

## 13. Mejoras sugeridas (orden sugerido por impacto)

1. **UI Clientes** mínima (`panel/clientes`) consumiendo `GET .../clientes`; luego API + pantalla de detalle usando `getCustomerById` / métricas.
2. **Integraciones MP** en panel: alta/edición de `mp_integrations`, creación de preferencia y fila `payments` pendiente enlazada a orden.
3. **Usuarios / sucursales / proveedores** — implementar o ocultar del Aside hasta estar listos.
4. **`customer.ts`** en `src/types/` alineado con DB y API.
5. Reglas ESLint para `alert`/`confirm`/colores fuera de tokens (si no existen).
6. README con flujo: `db:up` → `db:reset` / seed → migraciones opcionales + variables MP.

---

## 14. Próximos pasos recomendados (dependencias)

1. Alinear entornos (schema + scripts de migración documentados en README).
2. **Cerrar superficie de panel** (páginas `null` → contenido mínimo o ocultar en navegación).
3. **Calendario:** decidir si se implementa FullCalendar de nuevo o se deja fuera del alcance explícito.
4. **Store** super-admin al final o en paralelo si no bloquea tenants.
5. Higiene UI (tokens, revisión puntual de badges).

---

*Documento vivo: actualizar tras cambios mayores de arquitectura o antes de releases.*
