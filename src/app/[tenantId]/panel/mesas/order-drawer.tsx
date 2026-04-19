"use client";

import {
  Button,
  Input,
  Modal,
  Text,
  toast,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Button as RacButton } from "react-aria-components";
import { z } from "zod";

import { DialogSuccess, DialogWarning } from "@/components/ui";
import type { Order, OrderItem, OrderStatus, OrderType } from "@/types/order";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function elapsedLabel(iso: string): string {
  const t = new Date(iso).getTime();
  const d = Math.max(0, Date.now() - t);
  const m = Math.floor(d / 60000);
  if (m < 60) {
    return `${m} min`;
  }
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function typeLabel(t: OrderType): string {
  switch (t) {
    case "dine_in":
      return "Salón";
    case "takeaway":
      return "Take away";
    case "delivery":
      return "Delivery";
    default:
      return "Online";
  }
}

type ProductLite = {
  id: string;
  name: string;
  price: number;
  discount_price: number | null;
};

type VariantLite = { id: string; name: string; price: number | null };

export function OrderDrawer({
  tenantId,
  orderId,
  open,
  onClose,
  statuses,
  onChanged,
}: {
  tenantId: string;
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  statuses: OrderStatus[];
  onChanged: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [variants, setVariants] = useState<VariantLite[]>([]);
  const [pickProductId, setPickProductId] = useState<string | null>(null);
  const [pickQty, setPickQty] = useState(1);
  const [pickVariantId, setPickVariantId] = useState<string>("");
  const payModal = useOverlayState();

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/ordenes/${orderId}`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => null)) as
        | { order?: Order; error?: string }
        | null;
      if (!res.ok) {
        toast.danger(j?.error ?? "No se pudo cargar la orden");
        setOrder(null);
        return;
      }
      setOrder(j?.order ?? null);
    } finally {
      setLoading(false);
    }
  }, [orderId, tenantId]);

  useEffect(() => {
    if (open && orderId) {
      void loadOrder();
    } else {
      setOrder(null);
      setProductQuery("");
      setProducts([]);
      setVariants([]);
      setPickProductId(null);
    }
  }, [open, orderId, loadOrder]);

  const isTerminal = order?.status?.is_terminal === true;

  const transitionStatuses = useMemo(() => {
    return statuses.filter(
      (s) =>
        !s.is_terminal &&
        s.key !== "closed" &&
        s.key !== "cancelled" &&
        s.key !== order?.status_key,
    );
  }, [statuses, order?.status_key]);

  const showProminentCobrar =
    order &&
    !isTerminal &&
    (order.status_key === "ready" ||
      order.status_key === "delivered" ||
      order.status_key === "in_progress");

  const searchProducts = useCallback(async () => {
    const q = productQuery.trim().toLowerCase();
    const res = await fetch(`/api/${tenantId}/productos`, { credentials: "include" });
    const j = (await res.json()) as { products?: ProductLite[] };
    const list = (j.products ?? []).filter((p) =>
      q ? p.name.toLowerCase().includes(q) : true,
    );
    setProducts(list.slice(0, 40));
  }, [tenantId, productQuery]);

  useEffect(() => {
    if (!open || !pickProductId) {
      setVariants([]);
      return;
    }
    (async () => {
      const res = await fetch(`/api/${tenantId}/productos/${pickProductId}`, {
        credentials: "include",
      });
      const j = (await res.json()) as { variants?: VariantLite[] };
      setVariants(j.variants ?? []);
    })();
  }, [open, pickProductId, tenantId]);

  async function patchStatus(key: string) {
    if (!orderId) {
      return;
    }
    const res = await fetch(`/api/${tenantId}/ordenes/${orderId}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status_key: key }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string };
    if (!res.ok) {
      toast.danger(j?.error ?? "No se pudo actualizar");
      return;
    }
    toast.success("Estado actualizado");
    await loadOrder();
    onChanged();
  }

  async function removeItem(item: OrderItem) {
    if (!orderId) {
      return;
    }
    const res = await fetch(
      `/api/${tenantId}/ordenes/${orderId}/lineas/${item.id}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string };
      toast.danger(j?.error ?? "No se pudo eliminar");
      return;
    }
    await loadOrder();
    onChanged();
  }

  async function addLine() {
    if (!orderId || !pickProductId) {
      return;
    }
    const res = await fetch(`/api/${tenantId}/ordenes/${orderId}/lineas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        product_id: pickProductId,
        variant_id: pickVariantId || undefined,
        quantity: pickQty,
      }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string };
    if (!res.ok) {
      toast.danger(j?.error ?? "No se pudo agregar");
      return;
    }
    setPickProductId(null);
    setPickVariantId("");
    setPickQty(1);
    setProductQuery("");
    setProducts([]);
    await loadOrder();
    onChanged();
  }

  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[color:var(--nuba-scrim)] backdrop-blur-[2px] transition-opacity"
        aria-hidden
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border-subtle bg-surface shadow-2xl"
        style={{ background: "var(--nuba-surface)" }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-4 py-4">
          <div className="min-w-0 flex-1">
            <Text className="text-lg font-semibold text-foreground">
              {order?.location?.name ?? "Orden"}
            </Text>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {order ? (
                <span className="rounded-md bg-raised px-2 py-0.5 text-xs text-foreground-secondary">
                  {typeLabel(order.type)}
                </span>
              ) : null}
              {order ? (
                <Text className="text-xs text-foreground-muted">
                  {elapsedLabel(order.created_at)}
                </Text>
              ) : null}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label="Cerrar"
            onPress={onClose}
          >
            <X className="size-5" />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <Text className="text-sm text-foreground-muted">Cargando…</Text>
            ) : null}
            {!loading && order ? (
              <ul className="flex flex-col gap-3">
                {order.items.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border-subtle bg-raised/50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <Text className="text-sm font-medium text-foreground">
                        {it.quantity}× {it.name}
                      </Text>
                      <Text className="text-xs text-foreground-muted">
                        {money.format(it.unit_price)} c/u ·{" "}
                        {money.format(it.subtotal)}
                      </Text>
                    </div>
                    {!isTerminal ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        className="text-danger"
                        aria-label="Quitar"
                        onPress={() => void removeItem(it)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {!isTerminal && order ? (
              <div className="mt-4 rounded-lg border border-dashed border-border-subtle bg-background/80 p-3">
                <Text className="mb-2 text-sm font-medium text-foreground">
                  Agregar producto
                </Text>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      variant="secondary"
                      placeholder="Buscar…"
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void searchProducts();
                        }
                      }}
                    />
                    <Button size="sm" variant="secondary" onPress={() => void searchProducts()}>
                      Buscar
                    </Button>
                  </div>
                  {products.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-border-subtle">
                      {products.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="block w-full px-2 py-1.5 text-start text-sm hover:bg-raised"
                          onClick={() => {
                            setPickProductId(p.id);
                            setPickVariantId("");
                          }}
                        >
                          {p.name}{" "}
                          <span className="text-foreground-muted">
                            {money.format(
                              p.discount_price != null ? p.discount_price : p.price,
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {pickProductId ? (
                    <div className="flex flex-col gap-2">
                      {variants.length > 0 ? (
                        <select
                          className="h-10 rounded-lg border border-border-subtle bg-background px-2 text-sm"
                          value={pickVariantId}
                          onChange={(e) => setPickVariantId(e.target.value)}
                        >
                          <option value="">Sin variación</option>
                          {variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                              {v.price != null ? ` (${money.format(v.price)})` : ""}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          variant="secondary"
                          className="w-24"
                          value={String(pickQty)}
                          onChange={(e) =>
                            setPickQty(Math.max(1, Number(e.currentTarget.value) || 1))
                          }
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          className="bg-accent text-accent-text"
                          onPress={() => void addLine()}
                        >
                          <Plus className="size-4" />
                          Agregar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <footer className="shrink-0 border-t border-border-subtle bg-background/95 px-4 py-4 backdrop-blur-md">
            {order ? (
              <div className="mb-3 flex flex-col gap-1 text-sm">
                <div className="flex justify-between text-foreground-secondary">
                  <span>Subtotal</span>
                  <span>{money.format(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-foreground-secondary">
                  <span>Descuento</span>
                  <span>{money.format(order.discount)}</span>
                </div>
                <div className="flex justify-between font-semibold text-foreground">
                  <span>Total</span>
                  <span>{money.format(order.total)}</span>
                </div>
              </div>
            ) : null}

            {order && !isTerminal ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {transitionStatuses.map((s) => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant="secondary"
                    className="border border-border-subtle"
                    style={{
                      borderColor: s.color,
                      color: s.color,
                      background: `${s.color}14`,
                    }}
                    onPress={() => void patchStatus(s.key)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            ) : null}

            {order && !isTerminal ? (
              <Button
                size="md"
                variant="primary"
                className={
                  showProminentCobrar
                    ? "w-full bg-accent text-accent-text font-semibold"
                    : "w-full"
                }
                onPress={() => payModal.open()}
              >
                Cobrar
              </Button>
            ) : null}
          </footer>
        </div>
      </aside>
      {order && !isTerminal ? (
        <PaymentModal
          tenantId={tenantId}
          orderId={order.id}
          total={order.total}
          state={payModal}
          onPaid={async () => {
            payModal.close();
            await loadOrder();
            onChanged();
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

const payFormSchema = z.object({
  method: z.enum(["cash", "card", "mercadopago", "transfer"]),
  amount: z
    .string()
    .min(1, "Indicá el importe")
    .refine((s) => {
      const n = Number(String(s).replace(",", "."));
      return Number.isFinite(n) && n > 0;
    }, "Importe inválido"),
});

type PayFormValues = z.infer<typeof payFormSchema>;

function PaymentModal({
  tenantId,
  orderId,
  total,
  state,
  onPaid,
}: {
  tenantId: string;
  orderId: string;
  total: number;
  state: ReturnType<typeof useOverlayState>;
  onPaid: () => void;
}) {
  const [successOpen, setSuccessOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnMsg, setWarnMsg] = useState("");

  const form = useForm<PayFormValues>({
    resolver: zodResolver(payFormSchema),
    defaultValues: {
      method: "cash",
      amount: String(Math.round(total)),
    },
  });

  useEffect(() => {
    if (!state.isOpen) {
      return;
    }
    form.reset({
      method: "cash",
      amount: String(Math.round(total)),
    });
    form.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir el modal o cambiar el total
  }, [state.isOpen, total]);

  const submitting = form.formState.isSubmitting;

  const submitPay = form.handleSubmit(async (values) => {
    const amountNum = Number(String(values.amount).replace(",", "."));
    const res = await fetch(`/api/${tenantId}/ordenes/${orderId}/cierre`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        method: values.method,
        amount: amountNum || total,
      }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string };
    if (!res.ok) {
      setWarnMsg(j?.error ?? "No se pudo cobrar");
      setWarnOpen(true);
      return;
    }
    state.close();
    setSuccessOpen(true);
  });

  const modalPortalTarget =
    typeof document !== "undefined" ? document.body : undefined;

  return (
    <>
      <DialogSuccess
        isOpen={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          void onPaid();
        }}
        title="Orden cerrada"
        description="El cobro se registró correctamente."
      />
      <DialogWarning
        isOpen={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="No se pudo cobrar"
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
          <Modal.Container placement="center" size="md">
            <Modal.Dialog className="max-w-md">
              <Modal.Header className="flex flex-row items-center justify-between gap-3 border-b border-border-subtle pb-4">
                <Modal.Heading className="flex-1">Cobrar orden</Modal.Heading>
                <Modal.CloseTrigger aria-label="Cerrar" />
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <label className="text-sm text-foreground-secondary">Método</label>
                <select
                  className="h-10 rounded-lg border border-border-subtle bg-background px-2 text-sm"
                  {...form.register("method")}
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="mercadopago">Mercado Pago</option>
                  <option value="transfer">Transferencia</option>
                </select>
                {form.formState.errors.method?.message ? (
                  <Text className="text-sm text-danger">
                    {form.formState.errors.method.message}
                  </Text>
                ) : null}
                <label className="text-sm text-foreground-secondary">Importe</label>
                <Input variant="secondary" {...form.register("amount")} />
                {form.formState.errors.amount?.message ? (
                  <Text className="text-sm text-danger">
                    {form.formState.errors.amount.message}
                  </Text>
                ) : null}
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2">
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
                  onPress={() => void submitPay()}
                >
                  Confirmar cobro
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  );
}
