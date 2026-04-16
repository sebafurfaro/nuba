"use client";

import { useEffect, useState } from "react";

import { Aside } from "@/components/layout/Aside";
import { Header } from "@/components/layout/Header";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { Role } from "@/lib/permissions";

const STORAGE_KEY = "nuba.panel.asideCollapsed";

type PanelLayoutClientProps = {
  tenantId: string;
  role: Role;
  children: React.ReactNode;
};

export function PanelLayoutClient({
  tenantId,
  role,
  children,
}: PanelLayoutClientProps) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMounted(true);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === "1") {
          setCollapsed(true);
        }
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, mounted]);

  useEffect(() => {
    if (!isMobile) {
      const id = requestAnimationFrame(() => setMobileNavOpen(false));
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !mobileNavOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, mobileNavOpen]);

  useEffect(() => {
    if (!isMobile || !mobileNavOpen) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, mobileNavOpen]);

  return (
    <div className="panel-shell relative flex min-h-dvh w-full text-foreground">
      <div className="pointer-events-none absolute inset-0 panel-grid opacity-70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-white/30 via-transparent to-transparent dark:from-white/6" />

      {isMobile && mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-label="Cerrar menú"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <Aside
        tenantId={tenantId}
        role={role}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        isMobile={isMobile}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Header
          tenantId={tenantId}
          role={role}
          showMobileNav={isMobile}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-auto px-3 pb-4 pt-3 md:px-5 md:pb-5 md:pt-4">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
