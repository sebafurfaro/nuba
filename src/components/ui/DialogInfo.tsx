"use client";

import { Button, Modal, Text } from "@heroui/react";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Dialog } from "./Dialog";

export type DialogInfoProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
};

export function DialogInfo({
  isOpen,
  onClose,
  title,
  description,
  children,
}: DialogInfoProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      header={
        <>
          <Info
            className="size-10 shrink-0"
            style={{ color: "var(--accent)" }}
            aria-hidden
          />
          <Modal.Heading className="flex-1 pt-1">{title}</Modal.Heading>
        </>
      }
      footer={
        <Button
          variant="primary"
          className="bg-accent text-accent-text hover:bg-accent-hover"
          onPress={onClose}
        >
          Entendido
        </Button>
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
      </div>
    </Dialog>
  );
}
