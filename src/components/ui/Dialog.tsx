"use client";

import { Modal, useOverlayState } from "@heroui/react";
import type { ReactNode } from "react";

export type DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Encabezado (p. ej. ícono + `Modal.Heading`). */
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Clases extra del cuerpo (p. ej. `pt-0`). */
  bodyClassName?: string;
};

/**
 * Contenedor modal genérico (Hero UI Modal) con blur en el backdrop.
 * Preferí los compuestos `DialogInfo` / `DialogSuccess` / `DialogWarning` para casos típicos.
 */
export function Dialog({
  isOpen,
  onClose,
  header,
  children,
  footer,
  bodyClassName,
}: DialogProps) {
  const overlay = useOverlayState({
    isOpen,
    onOpenChange: (open) => {
      if (!open) {
        onClose();
      }
    },
  });

  const modalPortalTarget =
    typeof document !== "undefined" ? document.body : undefined;

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop
        className="z-200 flex items-center justify-center p-4"
        variant="blur"
        UNSTABLE_portalContainer={modalPortalTarget}
      >
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className="max-w-md border border-border-subtle bg-surface/95 shadow-lg outline-none backdrop-blur-sm">
            {header ? (
              <Modal.Header className="flex flex-row items-start gap-3 border-0 pb-2">
                {header}
              </Modal.Header>
            ) : null}
            <Modal.Body
              className={[header ? "pt-0" : "pt-4", bodyClassName]
                .filter(Boolean)
                .join(" ")}
            >
              {children}
            </Modal.Body>
            {footer ? (
              <Modal.Footer className="flex justify-end gap-2 border-t border-border-subtle pt-4">
                {footer}
              </Modal.Footer>
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
