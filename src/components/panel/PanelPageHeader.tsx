import { Text } from "@heroui/react";
import { clsx } from "clsx";
import type { ReactNode } from "react";

const titleClass = "text-2xl font-semibold tracking-tight text-foreground";
const descriptionClass = "mt-1 text-sm text-foreground-secondary";

export type PanelPageHeaderProps = {
  title: string;
  /** Texto o fragmento (p. ej. con `Link`) bajo el título. */
  description?: ReactNode;
  /** Clases extra del título. */
  titleClassName?: string;
  /** Clases extra del bloque de descripción (p. ej. `max-w-2xl`). */
  descriptionClassName?: string;
  /** Contenido alineado al final en desktop (botones, etc.). */
  end?: ReactNode;
  className?: string;
};

/**
 * Encabezado estándar de páginas del panel (título + descripción opcional + acciones).
 */
export function PanelPageHeader({
  title,
  description,
  titleClassName,
  descriptionClassName,
  end,
  className,
}: PanelPageHeaderProps) {
  const hasDescription = description != null;

  return (
    <header
      className={clsx(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <Text className={clsx(titleClass, titleClassName)}>{title}</Text>
        {hasDescription ? (
          <div
            className={clsx(descriptionClass, descriptionClassName)}
          >
            {description}
          </div>
        ) : null}
      </div>
      {end != null ? (
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">{end}</div>
      ) : null}
    </header>
  );
}
