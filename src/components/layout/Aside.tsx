"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Building2,
  CalendarDays,
  LayoutDashboard,
  Package,
  PanelLeft,
  PanelLeftClose,
  Plug,
  Shield,
  Tags,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Button,
  Disclosure,
  Separator,
  Surface,
  Text,
  Tooltip,
} from "@heroui/react";
import { cn } from "@heroui/react";
import { Nuba } from "@/components/nuba/nuba";
import type { PanelNavItem, Role } from "@/lib/permissions";
import { panelNavItemsForRole } from "@/lib/permissions";

type AsideProps = {
  tenantId: string;
  role: Role;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isMobile: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

type NavGroupId = "main" | "ops" | "cat" | "org";

const GROUP_ORDER: NavGroupId[] = ["main", "ops", "cat", "org"];

const GROUP_LABEL: Record<NavGroupId, string> = {
  main: "Principal",
  ops: "Operación",
  cat: "Catálogo",
  org: "Organización",
};

function navGroup(item: PanelNavItem, base: string): NavGroupId {
  if (item.href === base) {
    return "main";
  }
  if (["mesas", "calendario", "clientes"].includes(item.section)) {
    return "ops";
  }
  if (item.section === "productos" || item.section === "categorias") {
    return "cat";
  }
  return "org";
}

function navIcon(item: PanelNavItem) {
  if (item.label === "Métricas") {
    return LayoutDashboard;
  }
  if (item.label === "Productos") {
    return Package;
  }
  if (item.label === "Categorías") {
    return Tags;
  }
  if (item.label === "Mesas") {
    return UtensilsCrossed;
  }
  if (item.label === "Clientes") {
    return Users;
  }
  if (item.label === "Usuarios") {
    return UserCog;
  }
  if (item.label === "Sucursales") {
    return Building2;
  }
  if (item.label === "Calendario") {
    return CalendarDays;
  }
  if (item.label === "Proveedores") {
    return Truck;
  }
  if (item.label === "Integraciones") {
    return Plug;
  }
  if (item.label === "Administración") {
    return Shield;
  }
  return LayoutDashboard;
}

export function Aside({
  tenantId,
  role,
  collapsed,
  onToggleCollapsed,
  isMobile,
  mobileOpen,
  onMobileClose,
}: AsideProps) {
  const pathname = usePathname();
  const base = `/${tenantId}/panel`;
  const items = useMemo(() => panelNavItemsForRole(tenantId, role), [tenantId, role]);

  const effectiveCollapsed = isMobile ? false : collapsed;
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevPathRef.current === null) {
      prevPathRef.current = pathname;
      return;
    }
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      if (isMobile && mobileOpen) {
        onMobileClose();
      }
    }
  }, [pathname, isMobile, mobileOpen, onMobileClose]);

  const grouped = useMemo(() => {
    const map = new Map<NavGroupId, PanelNavItem[]>();
    for (const g of GROUP_ORDER) {
      map.set(g, []);
    }
    for (const item of items) {
      const g = navGroup(item, base);
      map.get(g)!.push(item);
    }
    return map;
  }, [items, base]);

  const linkClass = (href: string) =>
    cn(
      "flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
      pathname === href || (href !== base && pathname.startsWith(`${href}/`))
        ? "bg-accent text-accent-text shadow-[0_10px_24px_rgba(79,70,229,0.2)]"
        : "text-default-600 hover:bg-default/45 hover:text-foreground",
      effectiveCollapsed && !isMobile && "justify-center px-0",
    );

  const navExpanded = (
    <>
      {GROUP_ORDER.map((gid) => {
        const groupItems = grouped.get(gid) ?? [];
        if (groupItems.length === 0) {
          return null;
        }
        if (gid === "main") {
          return (
            <div key={gid} className="flex flex-col gap-1">
              {groupItems.map((item) => {
                const Icon = navIcon(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={linkClass(item.href)}
                    onClick={() => {
                      if (isMobile) {
                        onMobileClose();
                      }
                    }}
                  >
                    <Icon className="size-4 shrink-0 opacity-80" />
                    {item.label}
                  </Link>
                );
              })}
              <Separator className="my-2" />
            </div>
          );
        }
        return (
          <Disclosure key={gid} defaultExpanded>
            <Disclosure.Heading className="px-1">
              <Disclosure.Trigger className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-default-500 hover:bg-default/30">
                {GROUP_LABEL[gid]}
                <Disclosure.Indicator className="size-3" />
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="flex flex-col gap-0.5 pb-2 pl-1">
                {groupItems.map((item) => {
                  const Icon = navIcon(item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={linkClass(item.href)}
                      onClick={() => {
                        if (isMobile) {
                          onMobileClose();
                        }
                      }}
                    >
                      <Icon className="size-4 shrink-0 opacity-80" />
                      {item.label}
                    </Link>
                  );
                })}
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        );
      })}
    </>
  );

  const navCollapsedDesktop = (
    <div className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = navIcon(item);
        return (
          <Tooltip.Root key={item.href} delay={300}>
            <Tooltip.Trigger>
              <Link
                href={item.href}
                className={linkClass(item.href)}
                aria-label={item.label}
                onClick={() => {
                  if (isMobile) {
                    onMobileClose();
                  }
                }}
              >
                <Icon className="size-5 shrink-0 opacity-90" />
              </Link>
            </Tooltip.Trigger>
            <Tooltip.Content offset={8}>{item.label}</Tooltip.Content>
          </Tooltip.Root>
        );
      })}
    </div>
  );

  return (
    <Surface
      variant="secondary"
      className={cn(
        "panel-glass flex h-dvh shrink-0 flex-col overflow-hidden border-e border-default-200/20",
        isMobile
          ? mobileOpen
            ? "fixed inset-y-0 start-0 z-50 m-3 w-[calc(100vw-1.5rem)] max-w-[20rem] rounded-[28px] shadow-2xl md:static md:z-30 md:m-0 md:max-w-none md:rounded-none md:shadow-none"
            : "hidden md:flex"
          : "sticky top-0 z-30 m-3 h-[calc(100dvh-1.5rem)] rounded-[30px] md:flex",
        !isMobile && (collapsed ? "w-20" : "w-72"),
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b border-default-200/70 px-4 py-4",
          !isMobile && effectiveCollapsed && "justify-center",
        )}
      >
        {isMobile ? (
          <div className="flex w-full items-center justify-between gap-2">
            <Nuba />
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              className="rounded-full border border-border-subtle/70 bg-surface/65"
              aria-label="Cerrar menú"
              onPress={onMobileClose}
            >
              <X className="size-5" />
            </Button>
          </div>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              className="rounded-full border border-border-subtle/70 bg-surface/65"
              aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
              onPress={onToggleCollapsed}
            >
              {collapsed ? (
                <PanelLeft className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
            {!collapsed ? <Nuba /> : null}
          </>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
        {isMobile || !effectiveCollapsed ? navExpanded : navCollapsedDesktop}
      </nav>

      {!isMobile && !effectiveCollapsed ? (
        <div className="border-t border-default-200/70 px-4 py-4">
          <Text className="text-xs text-default-500">
            Rol: <span className="font-medium capitalize">{role}</span>
          </Text>
        </div>
      ) : null}

      {isMobile ? (
        <div className="border-t border-default-200/70 px-4 py-4 md:hidden">
          <Text className="text-xs text-default-500">
            Rol: <span className="font-medium capitalize">{role}</span>
          </Text>
        </div>
      ) : null}
    </Surface>
  );
}
