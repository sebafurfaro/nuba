"use client";

import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button, Header as HeroHeader, Text } from "@heroui/react";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { Nuba } from "@/components/nuba/nuba";
import type { Role } from "@/lib/permissions";

type HeaderProps = {
  tenantId: string;
  role: Role;
  showMobileNav?: boolean;
  onOpenMobileNav?: () => void;
};

export function Header({
  tenantId,
  role,
  showMobileNav = false,
  onOpenMobileNav,
}: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <HeroHeader className="sticky top-0 z-30 px-3 pb-0 pt-3 md:px-5 md:pt-4">
      <div className="panel-glass flex h-16 items-center justify-between gap-3 rounded-[24px] px-3 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          {showMobileNav ? (
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              className="shrink-0 rounded-full border border-border-subtle/70 bg-surface/65 md:hidden"
              aria-label="Abrir menú"
              onPress={() => onOpenMobileNav?.()}
            >
              <Menu className="size-5" />
            </Button>
          ) : null}

          <Nuba className="flex h-7 w-auto max-w-[min(120px,38vw)] shrink-0 md:hidden sm:max-w-[140px]" />

          <div className="hidden min-w-0 md:block">
            <Text className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground-muted">
              Workspace
            </Text>
            <Text className="truncate text-sm font-semibold text-foreground">
              Panel <span className="text-foreground-secondary">/ {tenantId}</span>
            </Text>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <div className="hidden rounded-full border border-border-subtle/70 bg-surface/60 px-3 py-1 text-xs font-medium text-foreground-secondary md:block">
            Rol: <span className="text-foreground">{roleLabel}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            className="rounded-full border border-border-subtle/70 bg-surface/65"
            aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
            isDisabled={!mounted}
            onPress={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          <NotificationCenter />
        </div>
      </div>
    </HeroHeader>
  );
}
