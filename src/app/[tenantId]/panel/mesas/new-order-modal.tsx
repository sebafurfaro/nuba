"use client";

import {
  Button,
  Input,
  Label,
  Modal,
  Text,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button as RacButton } from "react-aria-components";
import { z } from "zod";

import {
  ProductSelector,
  type CartItem,
  type ProductSelectorHandle,
} from "@/components/panel/orders/ProductSelector";
import { DialogSuccess, DialogWarning } from "@/components/ui";
import type { CreateOrderInput, OrderType } from "@/types/order";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export type LocationRow = {
  id: string;
  type: string;
  name: string;
  branch_id: string | null;
  table_id: string | null;
};

type CustomerRow = {
  id: string;
  first_name: string;
  last_name: string;
};

type CartLine = {
  product_id: string;
  variant_id?: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

const modalOrderTypeSchema = z.enum(["dine_in", "takeaway", "delivery"]);

type NewOrderFormValues = {
  orderType: z.infer<typeof modalOrderTypeSchema>;
  locationId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  customerId: string;
};

function filteredLocationsFor(
  locations: LocationRow[],
  orderType: OrderType,
): LocationRow[] {
  if (orderType === "dine_in") {
    return locations.filter((l) => l.type === "table" || l.type === "counter");
  }
  if (orderType === "takeaway") {
    return locations.filter((l) => l.type === "takeaway");
  }
  return locations.filter((l) => l.type === "delivery");
}

function mergeCartFromSelector(prev: CartLine[], incoming: CartItem[]): CartLine[] {
  const next = [...prev];
  for (const item of incoming) {
    const idx = next.findIndex(
      (l) =>
        l.product_id === item.product_id &&
        (item.variant_id ? l.variant_id === item.variant_id : !l.variant_id),
    );
    if (idx === -1) {
      next.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      });
    } else {
      const cur = next[idx]!;
      next[idx] = { ...cur, quantity: cur.quantity + item.quantity };
    }
  }
  return next;
}

function createNewOrderFormSchema(locations: LocationRow[]) {
  return z
    .object({
      orderType: modalOrderTypeSchema,
      locationId: z.string(),
      customerName: z.string(),
      customerPhone: z.string(),
      deliveryAddress: z.string(),
      customerId: z.string(),
    })
    .superRefine((data, ctx) => {
      const filtered = filteredLocationsFor(locations, data.orderType);
      if (filtered.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["locationId"],
          message:
            "No hay ubicaciones para este tipo de orden. Cargá ubicaciones en el panel.",
        });
        return;
      }
      if (!data.locationId || !filtered.some((l) => l.id === data.locationId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["locationId"],
          message: "Elegí una ubicación",
        });
      }
      if (data.orderType === "takeaway") {
        if (!data.customerName.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["customerName"],
            message: "Indicá el nombre del cliente",
          });
        }
      }
      if (data.orderType === "delivery") {
        if (!data.customerName.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["customerName"],
            message: "Indicá el nombre del cliente",
          });
        }
        if (!data.deliveryAddress.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddress"],
            message: "Indicá la dirección",
          });
        }
      }
    });
}

export function NewOrderModal({
  tenantId,
  state,
  locations,
  initialLocationId,
  allowTakeaway = true,
  allowDelivery = true,
  canManageUbicaciones = false,
  onCreated,
}: {
  tenantId: string;
  state: ReturnType<typeof useOverlayState>;
  locations: LocationRow[];
  initialLocationId: string | null;
  allowTakeaway?: boolean;
  allowDelivery?: boolean;
  /** Admin / supervisor: puede ir a la pantalla de ubicaciones. */
  canManageUbicaciones?: boolean;
  onCreated: () => void;
}) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartRef = useRef<CartLine[]>([]);
  cartRef.current = cart;
  const productSelectorRef = useRef<ProductSelectorHandle | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnMsg, setWarnMsg] = useState("");

  const orderFormSchema = useMemo(
    () => createNewOrderFormSchema(locations),
    [locations],
  );

  const form = useForm<NewOrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      orderType: "dine_in",
      locationId: "",
      customerName: "",
      customerPhone: "",
      deliveryAddress: "",
      customerId: "",
    },
  });

  const orderType = form.watch("orderType");
  const locationId = form.watch("locationId");

  useEffect(() => {
    if (!state.isOpen) {
      return;
    }
    form.reset({
      orderType: "dine_in",
      locationId: initialLocationId ?? "",
      customerName: "",
      customerPhone: "",
      deliveryAddress: "",
      customerId: "",
    });
    setCart([]);
    form.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir / cambiar ubicación inicial
  }, [state.isOpen, initialLocationId]);

  useEffect(() => {
    if (cart.length > 0) {
      form.clearErrors("root");
    }
  }, [cart.length, form]);

  useEffect(() => {
    if (!state.isOpen || orderType !== "dine_in") {
      return;
    }
    (async () => {
      const res = await fetch(`/api/${tenantId}/clientes`, { credentials: "include" });
      const j = (await res.json()) as { customers?: CustomerRow[] };
      setCustomers(j.customers ?? []);
    })();
  }, [state.isOpen, orderType, tenantId]);

  const filteredLocations = useMemo(
    () => filteredLocationsFor(locations, orderType),
    [locations, orderType],
  );

  useEffect(() => {
    if (!state.isOpen) {
      return;
    }
    if (
      locationId &&
      filteredLocations.length > 0 &&
      !filteredLocations.some((l) => l.id === locationId)
    ) {
      form.setValue("locationId", filteredLocations[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setValue estable desde useForm
  }, [state.isOpen, filteredLocations, locationId]);

  function removeLine(i: number) {
    setCart((prev) => prev.filter((_, idx) => idx !== i));
  }

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const submitting = form.formState.isSubmitting;

  const submitOrder = form.handleSubmit(async (data) => {
    const pendingFromSelector =
      productSelectorRef.current?.consumePendingCart() ?? [];
    const mergedLines = mergeCartFromSelector(
      cartRef.current,
      pendingFromSelector,
    );
    if (!mergedLines.length) {
      form.setError("root", {
        type: "validate",
        message: "Agregá al menos un producto",
      });
      return;
    }
    setCart(mergedLines);
    const body: CreateOrderInput = {
      location_id: data.locationId,
      type: data.orderType,
      customer_id:
        data.orderType === "dine_in" && data.customerId ? data.customerId : undefined,
      customer_name:
        data.orderType === "takeaway" || data.orderType === "delivery"
          ? data.customerName.trim()
          : undefined,
      customer_phone:
        data.orderType === "takeaway" || data.orderType === "delivery"
          ? data.customerPhone.trim() || undefined
          : undefined,
      delivery_address:
        data.orderType === "delivery" ? data.deliveryAddress.trim() : undefined,
      items: mergedLines.map((c) => ({
        product_id: c.product_id,
        variant_id: c.variant_id,
        quantity: c.quantity,
      })),
    };
    const res = await fetch(`/api/${tenantId}/ordenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { error?: string };
    if (!res.ok) {
      setWarnMsg(j?.error ?? "No se pudo crear la orden");
      setWarnOpen(true);
      return;
    }
    state.close();
    onCreated();
    setSuccessOpen(true);
  });

  const modalPortalTarget =
    typeof document !== "undefined" ? document.body : undefined;

  return (
    <>
      <DialogSuccess
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        title="Orden creada"
        description="La orden se registró correctamente."
      />
      <DialogWarning
        isOpen={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="No se pudo crear la orden"
        description={warnMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setWarnOpen(false)}
      />

      <Modal.Root state={state}>
        <Modal.Backdrop
          className="z-200"
          UNSTABLE_portalContainer={modalPortalTarget}
        >
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="max-h-[90dvh] max-w-5xl overflow-hidden">
              <Modal.Header className="flex flex-row items-center justify-between gap-3 border-b border-border-subtle pb-4">
                <Modal.Heading className="flex-1">Nueva orden</Modal.Heading>
                <Modal.CloseTrigger aria-label="Cerrar" />
              </Modal.Header>
              <Modal.Body className="flex max-h-[calc(90dvh-8rem)] flex-col gap-4 overflow-y-auto">
                <div className="flex flex-col gap-1">
                  <Text className="text-sm text-foreground-secondary">Tipo</Text>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={orderType === "dine_in" ? "primary" : "secondary"}
                      className={
                        orderType === "dine_in" ? "bg-accent text-accent-text" : undefined
                      }
                      onPress={() =>
                        form.setValue("orderType", "dine_in", { shouldValidate: true })
                      }
                    >
                      Salón
                    </Button>
                    {allowTakeaway ? (
                      <Button
                        size="sm"
                        variant={orderType === "takeaway" ? "primary" : "secondary"}
                        className={
                          orderType === "takeaway"
                            ? "bg-accent text-accent-text"
                            : undefined
                        }
                        onPress={() =>
                          form.setValue("orderType", "takeaway", {
                            shouldValidate: true,
                          })
                        }
                      >
                        Take away
                      </Button>
                    ) : null}
                    {allowDelivery ? (
                      <Button
                        size="sm"
                        variant={orderType === "delivery" ? "primary" : "secondary"}
                        className={
                          orderType === "delivery"
                            ? "bg-accent text-accent-text"
                            : undefined
                        }
                        onPress={() =>
                          form.setValue("orderType", "delivery", {
                            shouldValidate: true,
                          })
                        }
                      >
                        Delivery
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm text-foreground-secondary">Ubicación</label>
                  {filteredLocations.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border-subtle bg-background/80 px-3 py-3 text-sm text-foreground-secondary">
                      <p>
                        No hay ubicaciones para este tipo de orden. Hace falta al menos
                        una ubicación activa (mesa, mostrador, take away, etc.).
                      </p>
                      {canManageUbicaciones ? (
                        <Link
                          href={`/${tenantId}/panel/ubicaciones`}
                          className="mt-2 inline-block text-sm font-medium text-accent underline-offset-2 hover:underline"
                        >
                          Ir a ubicaciones
                        </Link>
                      ) : (
                        <p className="mt-2 text-sm text-foreground-muted">
                          Pedile a un administrador que cargue ubicaciones en el panel.
                        </p>
                      )}
                    </div>
                  ) : (
                    <select
                      className="h-10 rounded-lg border border-border-subtle bg-background px-2 text-sm"
                      {...form.register("locationId")}
                    >
                      <option value="">Seleccionar…</option>
                      {filteredLocations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {form.formState.errors.locationId?.message ? (
                    <Text className="text-sm text-danger">
                      {form.formState.errors.locationId.message}
                    </Text>
                  ) : null}
                </div>

                {orderType === "takeaway" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="no-ta-name">Nombre cliente</Label>
                      <Input
                        id="no-ta-name"
                        variant="secondary"
                        {...form.register("customerName")}
                      />
                      {form.formState.errors.customerName?.message ? (
                        <Text className="text-sm text-danger">
                          {form.formState.errors.customerName.message}
                        </Text>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="no-ta-phone">Teléfono</Label>
                      <Input
                        id="no-ta-phone"
                        variant="secondary"
                        {...form.register("customerPhone")}
                      />
                    </div>
                  </div>
                ) : null}

                {orderType === "delivery" ? (
                  <div className="flex flex-col gap-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="no-de-name">Nombre cliente</Label>
                        <Input
                          id="no-de-name"
                          variant="secondary"
                          {...form.register("customerName")}
                        />
                        {form.formState.errors.customerName?.message ? (
                          <Text className="text-sm text-danger">
                            {form.formState.errors.customerName.message}
                          </Text>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="no-de-phone">Teléfono</Label>
                        <Input
                          id="no-de-phone"
                          variant="secondary"
                          {...form.register("customerPhone")}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="no-de-addr">Dirección</Label>
                      <Input
                        id="no-de-addr"
                        variant="secondary"
                        {...form.register("deliveryAddress")}
                      />
                      {form.formState.errors.deliveryAddress?.message ? (
                        <Text className="text-sm text-danger">
                          {form.formState.errors.deliveryAddress.message}
                        </Text>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {orderType === "dine_in" ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-foreground-secondary">
                      Cliente registrado (opcional)
                    </label>
                    <select
                      className="h-10 rounded-lg border border-border-subtle bg-background px-2 text-sm"
                      {...form.register("customerId")}
                    >
                      <option value="">Sin cliente</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.last_name}, {c.first_name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="rounded-lg border border-dashed border-border-subtle p-3">
                  <Text className="mb-2 text-sm font-medium">Productos</Text>
                  {form.formState.errors.root?.message ? (
                    <Text className="mb-2 text-sm text-danger">
                      {form.formState.errors.root.message}
                    </Text>
                  ) : null}
                  <ProductSelector
                    ref={productSelectorRef}
                    tenantId={tenantId}
                    onCartChange={(items) =>
                      setCart((prev) => mergeCartFromSelector(prev, items))
                    }
                  />
                </div>

                <div>
                  <Text className="mb-2 text-sm font-medium">Carrito</Text>
                  {cart.length === 0 ? (
                    <Text className="text-sm text-foreground-muted">Vacío</Text>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {cart.map((line, i) => (
                        <li
                          key={`${line.product_id}-${line.variant_id ?? ""}-${i}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-border-subtle px-2 py-1.5 text-sm"
                        >
                          <span className="min-w-0 truncate">
                            {line.quantity}× {line.name}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-foreground-muted">
                              {money.format(line.unitPrice * line.quantity)}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              isIconOnly
                              className="text-danger"
                              aria-label="Quitar"
                              onPress={() => removeLine(i)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex justify-between border-t border-border-subtle pt-2 text-sm font-semibold">
                    <span>Total</span>
                    <span>{money.format(subtotal)}</span>
                  </div>
                </div>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2 border-t border-border-subtle">
                <RacButton
                  slot="close"
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-foreground hover:bg-raised"
                >
                  Cancelar
                </RacButton>
                <Button
                  variant="primary"
                  className="bg-accent text-accent-text"
                  isDisabled={submitting}
                  onPress={() => void submitOrder()}
                >
                  Crear orden
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}
