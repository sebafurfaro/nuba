"use client";

import { Toast } from "@heroui/react";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
    >
      {/*
        Toast.Provider no debe envolver la app: si recibe children como elementos,
        HeroUI los usa como contenido de cada toast y rompe toda la UI.
        La cola global (`toast`) sigue funcionando con la región como hermana.
      */}
      {children}
      <Toast.Provider placement="bottom end" />
    </ThemeProvider>
  );
}
