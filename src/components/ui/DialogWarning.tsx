"use client";

import { Button, Modal, Text } from "@heroui/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Dialog } from "./Dialog";

export type DialogWarningProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
  isLoading?: boolean;
  children?: ReactNode;
};

export function DialogWarning({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  isLoading,
  children,
}: DialogWarningProps) {
  const [internalBusy, setInternalBusy] = useState(false);
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const isDestructive = /eliminar|borrar/i.test(title);
  const busy = Boolean(isLoading) || internalBusy;

  useEffect(() => {
    if (!isOpen) {
      setErrorLine(null);
    }
  }, [isOpen]);

  async function handleConfirm() {
    if (!onConfirm) {
      onClose();
      return;
    }
    setInternalBusy(true);
    setErrorLine(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setErrorLine(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setInternalBusy(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      header={
        <>
          <AlertTriangle
            className="size-10 shrink-0"
            style={{ color: "var(--warning)" }}
            aria-hidden
          />
          <Modal.Heading className="flex-1 pt-1">{title}</Modal.Heading>
        </>
      }
      footer={
        <>
          <Button variant="secondary" isDisabled={busy} onPress={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? "danger" : "primary"}
            className={
              isDestructive
                ? undefined
                : "bg-accent text-accent-text hover:bg-accent-hover"
            }
            isDisabled={busy}
            onPress={() => void handleConfirm()}
          >
            <span className="inline-flex items-center gap-2">
              {busy ? (
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              ) : null}
              {confirmLabel}
            </span>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {description != null && description !== "" ? (
          typeof description === "string" ? (
            <Text className="text-sm text-foreground-secondary">{description}</Text>
          ) : (
            description
          )
        ) : null}
        {children}
        {errorLine ? (
          <Text className="text-sm text-danger">{errorLine}</Text>
        ) : null}
      </div>
    </Dialog>
  );
}
