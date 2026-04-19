export const ROLES = ["admin", "supervisor", "vendedor", "cliente"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Primer segmento bajo `/[tenantId]/panel/...` (vacío = home del panel). */
export function getPanelTrail(pathname: string, tenantId: string): string {
  const prefix = `/${tenantId}/panel`;
  if (!pathname.startsWith(prefix)) {
    return "";
  }
  let rest = pathname.slice(prefix.length);
  if (rest.startsWith("/")) {
    rest = rest.slice(1);
  }
  const q = rest.indexOf("?");
  if (q >= 0) {
    rest = rest.slice(0, q);
  }
  return rest.replace(/\/+$/, "");
}

export function canAccessPanelTrail(role: Role, trail: string): boolean {
  const segments = trail.split("/").filter(Boolean);
  const section = segments[0] ?? "";

  if (role === "admin") {
    return true;
  }

  if (role === "supervisor") {
    return section !== "administracion";
  }

  if (role === "vendedor") {
    const allowed = new Set([
      "",
      "productos",
      "categorias",
      "mesas",
      "clientes",
      "calendario",
    ]);
    return allowed.has(section);
  }

  if (role === "cliente") {
    return section === "" || section === "calendario";
  }

  return false;
}

export type PanelNavItem = {
  href: string;
  label: string;
  section: string;
};

export function panelNavItemsForRole(
  tenantId: string,
  role: Role,
): PanelNavItem[] {
  const base = `/${tenantId}/panel`;
  const all: PanelNavItem[] = [
    { href: base, label: "Métricas", section: "" },
    { href: `${base}/productos`, label: "Productos", section: "productos" },
    {
      href: `${base}/categorias`,
      label: "Categorías",
      section: "categorias",
    },
    { href: `${base}/mesas`, label: "Mesas", section: "mesas" },
    {
      href: `${base}/ubicaciones`,
      label: "Ubicaciones",
      section: "ubicaciones",
    },
    { href: `${base}/clientes`, label: "Clientes", section: "clientes" },
    { href: `${base}/usuarios`, label: "Usuarios", section: "usuarios" },
    { href: `${base}/sucursales`, label: "Sucursales", section: "sucursales" },
    { href: `${base}/calendario`, label: "Calendario", section: "calendario" },
    {
      href: `${base}/proveedores`,
      label: "Proveedores",
      section: "proveedores",
    },
    {
      href: `${base}/integraciones`,
      label: "Integraciones",
      section: "integraciones",
    },
    {
      href: `${base}/administracion`,
      label: "Administración",
      section: "administracion",
    },
  ];

  return all.filter((item) => {
    const trail =
      item.href === base ? "" : item.href.replace(`${base}/`, "");
    return canAccessPanelTrail(role, trail);
  });
}
