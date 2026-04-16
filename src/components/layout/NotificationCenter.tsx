"use client";

import { Bell } from "lucide-react";

import { Button, Popover, Text } from "@heroui/react";

export function NotificationCenter() {
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          className="rounded-full border border-border-subtle/70 bg-surface/65"
          aria-label="Notificaciones"
        >
          <Bell className="size-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Content className="w-80 p-0" placement="bottom end" offset={8}>
        <Popover.Dialog className="panel-glass max-h-96 overflow-hidden rounded-3xl shadow-lg">
          <div className="border-b border-default-200/80 px-3 py-2">
            <Text className="text-sm font-semibold">Central de notificaciones</Text>
          </div>
          <div className="px-3 py-6">
            <Text className="text-center text-sm text-default-500">
              No hay notificaciones por ahora.
            </Text>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover.Root>
  );
}
