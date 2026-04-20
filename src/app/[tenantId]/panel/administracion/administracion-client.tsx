"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Button,
  Card,
  Input,
  Label,
  SwitchControl,
  SwitchRoot,
  SwitchThumb,
  Tab,
  TabList,
  TabListContainer,
  TabPanel,
  TabsRoot,
  Text,
} from "@heroui/react";
import {
  ArrowRight,
  ExternalLink,
  GitBranch,
  ImagePlus,
  MapPin,
  Settings,
  Store,
  X,
} from "lucide-react";

import { OrderStatusesSettingsClient } from "./order-statuses/order-statuses-settings-client";
import { DialogSuccess } from "@/components/ui/DialogSuccess";
import { DialogWarning } from "@/components/ui/DialogWarning";
import { GeoSelector } from "@/components/ui/GeoSelector";
import type { FeatureFlagKey, Tenant } from "@/types/tenant";

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAG_CONFIG: Array<{
  key: FeatureFlagKey;
  label: string;
  description: string;
}> = [
  {
    key: "enable_tables",
    label: "Mesas y salón",
    description: "Gestión de mesas y órdenes en salón",
  },
  {
    key: "enable_takeaway",
    label: "Take away",
    description: "Órdenes para llevar",
  },
  {
    key: "enable_delivery",
    label: "Delivery",
    description: "Órdenes con dirección de entrega",
  },
  {
    key: "enable_reservations",
    label: "Reservas",
    description: "Calendario de reservas de mesas",
  },
  {
    key: "enable_mercadopago",
    label: "MercadoPago",
    description: "Cobros con MercadoPago",
  },
  {
    key: "enable_kitchen_display",
    label: "Display de cocina",
    description: "Vista KDS para la cocina",
  },
  {
    key: "enable_split_bill",
    label: "Dividir cuenta",
    description: "Dividir el total entre comensales",
  },
  {
    key: "enable_tips",
    label: "Propinas",
    description: "Agregar propina al cobrar",
  },
  {
    key: "enable_holiday_blocking",
    label: "Bloquear feriados",
    description: "Bloquea automáticamente los feriados nacionales para reservas",
  },
];

// ─── Schema ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255),
  description: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
  email: z.string().email("Email inválido"),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  logo_url: z.string().optional().nullable(),
  website: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || /^https?:\/\//i.test(v), { message: "URL inválida" }),
  instagram: z.string().max(100).optional().nullable(),
  facebook: z.string().max(100).optional().nullable(),
  whatsapp: z.string().max(50).optional().nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

// ─── Styles ───────────────────────────────────────────────────────────────────

const glassStyle = {
  background: "var(--nuba-glass-surface)",
  backdropFilter: "blur(var(--nuba-glass-blur-sm))",
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

type BranchSummary = { id: string; name: string; city: string | null };

export function AdministracionClient({ tenantId }: { tenantId: string }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [flags, setFlags] = useState<Partial<Record<FeatureFlagKey, boolean>>>({});
  const [activeBranches, setActiveBranches] = useState<BranchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [flagLoading, setFlagLoading] = useState<Partial<Record<FeatureFlagKey, boolean>>>({});
  const [logoUploading, setLogoUploading] = useState(false);

  const [successOpen, setSuccessOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnMsg, setWarnMsg] = useState("");
  const [flagWarnOpen, setFlagWarnOpen] = useState(false);
  const [flagWarnMsg, setFlagWarnMsg] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      description: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      province: "",
      logo_url: "",
      website: "",
      instagram: "",
      facebook: "",
      whatsapp: "",
    },
  });

  const descriptionValue = form.watch("description") ?? "";
  const logoUrl = form.watch("logo_url");

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [profileRes, flagsRes, branchesRes] = await Promise.all([
        fetch(`/api/${tenantId}/perfil`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/${tenantId}/banderas`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/${tenantId}/sucursales`, { cache: "no-store", credentials: "include" }),
      ]);

      if (!profileRes.ok || !flagsRes.ok) {
        setLoadError(true);
        return;
      }

      const profileData = (await profileRes.json()) as Tenant;
      const flagsData = (await flagsRes.json()) as { flags: Record<string, boolean> };
      const branchesData = branchesRes.ok
        ? ((await branchesRes.json()) as BranchSummary[])
        : [];

      setTenant(profileData);
      setFlags(flagsData.flags as Partial<Record<FeatureFlagKey, boolean>>);
      setActiveBranches(branchesData.filter((b) => (b as { is_active?: boolean }).is_active !== false));
      form.reset({
        name: profileData.name ?? "",
        description: profileData.description ?? "",
        email: profileData.email ?? "",
        phone: profileData.phone ?? "",
        address: profileData.address ?? "",
        city: profileData.city ?? "",
        province: profileData.province ?? "",
        logo_url: profileData.logo_url ?? "",
        website: profileData.website ?? "",
        instagram: profileData.instagram ?? "",
        facebook: profileData.facebook ?? "",
        whatsapp: profileData.whatsapp ?? "",
      });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId, form]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // ─── Profile submit ────────────────────────────────────────────────────────

  async function onSubmitProfile(data: ProfileFormValues) {
    const payload = {
      ...data,
      description: data.description || null,
      phone: data.phone || null,
      address: data.address || null,
      city: data.city || null,
      province: data.province || null,
      logo_url: data.logo_url || null,
      website: data.website || null,
      instagram: data.instagram || null,
      facebook: data.facebook || null,
      whatsapp: data.whatsapp || null,
    };

    const res = await fetch(`/api/${tenantId}/perfil`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string };
      setWarnMsg(j?.error ?? "Error al guardar el perfil");
      setWarnOpen(true);
      return;
    }

    const updated = (await res.json()) as Tenant;
    setTenant(updated);
    form.reset({
      name: updated.name ?? "",
      description: updated.description ?? "",
      email: updated.email ?? "",
      phone: updated.phone ?? "",
      address: updated.address ?? "",
      city: updated.city ?? "",
      province: updated.province ?? "",
      logo_url: updated.logo_url ?? "",
      website: updated.website ?? "",
      instagram: updated.instagram ?? "",
      facebook: updated.facebook ?? "",
      whatsapp: updated.whatsapp ?? "",
    });
    setSuccessOpen(true);
  }

  // ─── Flag toggle ───────────────────────────────────────────────────────────

  async function onToggleFlag(key: FeatureFlagKey, newValue: boolean) {
    const prev = flags[key] ?? false;
    setFlags((f) => ({ ...f, [key]: newValue }));
    setFlagLoading((l) => ({ ...l, [key]: true }));
    try {
      const res = await fetch(`/api/${tenantId}/banderas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ flag_key: key, is_enabled: newValue }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string };
        setFlags((f) => ({ ...f, [key]: prev }));
        setFlagWarnMsg(j?.error ?? "No se pudo guardar el cambio");
        setFlagWarnOpen(true);
        return;
      }

      // Sincronizar feriados al activar el bloqueo por primera vez
      if (key === "enable_holiday_blocking" && newValue && !prev) {
        void fetch(`/api/${tenantId}/feriados/sincronizar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ year: new Date().getFullYear() }),
        }).catch(() => null);
      }
    } catch {
      setFlags((f) => ({ ...f, [key]: prev }));
      setFlagWarnMsg("No se pudo guardar el cambio");
      setFlagWarnOpen(true);
    } finally {
      setFlagLoading((l) => ({ ...l, [key]: false }));
    }
  }

  // ─── Logo upload ───────────────────────────────────────────────────────────

  async function handleLogoFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setWarnMsg("El archivo no puede superar 2MB");
      setWarnOpen(true);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setWarnMsg("Solo se aceptan archivos jpg, png o webp");
      setWarnOpen(true);
      return;
    }
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/${tenantId}/subidas`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string };
        setWarnMsg(j?.error ?? "No se pudo subir el logo");
        setWarnOpen(true);
        return;
      }
      const j = (await res.json()) as { url: string };
      form.setValue("logo_url", j.url, { shouldDirty: true });
    } catch {
      setWarnMsg("No se pudo subir el logo");
      setWarnOpen(true);
    } finally {
      setLogoUploading(false);
    }
  }

  // ─── Loading / error ───────────────────────────────────────────────────────

  if (loading) return <AdminSkeleton />;

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-sm" style={{ color: "var(--nuba-danger)" }}>
          No se pudo cargar la configuración
        </p>
        <Button variant="secondary" onPress={() => void loadData()}>
          Reintentar
        </Button>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      <DialogSuccess
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        title="Perfil actualizado"
        description="Los cambios se guardaron correctamente."
      />
      <DialogWarning
        isOpen={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="No se pudo guardar"
        description={warnMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setWarnOpen(false)}
      />
      <DialogWarning
        isOpen={flagWarnOpen}
        onClose={() => setFlagWarnOpen(false)}
        title="Error al guardar"
        description={flagWarnMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setFlagWarnOpen(false)}
      />

      {/* Header */}
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--nuba-fg)" }}
        >
          Administración
        </h1>
        {tenant?.name ? (
          <p className="mt-1 text-sm" style={{ color: "var(--nuba-fg-muted)" }}>
            {tenant.name}
          </p>
        ) : null}
      </div>

      {/* Tabs */}
      <TabsRoot defaultSelectedKey="perfil">
        <TabListContainer>
          <TabList
            className="flex gap-1 border-b pb-px"
            style={{ borderColor: "var(--nuba-border-subtle)" }}
          >
            <Tab
              id="perfil"
              className="flex cursor-pointer items-center gap-1.5 rounded-t px-3 py-2 text-sm font-medium transition-colors outline-none selected:text-accent"
              style={{ color: "var(--nuba-fg-secondary)" }}
            >
              <Store className="size-4" />
              Perfil
            </Tab>
            <Tab
              id="config"
              className="flex cursor-pointer items-center gap-1.5 rounded-t px-3 py-2 text-sm font-medium transition-colors outline-none selected:text-accent"
              style={{ color: "var(--nuba-fg-secondary)" }}
            >
              <Settings className="size-4" />
              Configuración
            </Tab>
            <Tab
              id="pipeline"
              className="flex cursor-pointer items-center gap-1.5 rounded-t px-3 py-2 text-sm font-medium transition-colors outline-none selected:text-accent"
              style={{ color: "var(--nuba-fg-secondary)" }}
            >
              <GitBranch className="size-4" />
              Pipeline
            </Tab>
          </TabList>
        </TabListContainer>

        {/* ── Tab: Perfil ──────────────────────────────────────────────────── */}
        <TabPanel id="perfil" className="pt-6 outline-none">
          <form
            onSubmit={form.handleSubmit(onSubmitProfile)}
            className="flex flex-col gap-6"
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Left col — 2/3 */}
              <div className="flex flex-col gap-6 lg:col-span-2">
                {/* Datos del local */}
                <Card.Root
                  className="border border-border-subtle"
                  style={glassStyle}
                >
                  <Card.Header>
                    <Card.Title>Datos del local</Card.Title>
                  </Card.Header>
                  <Card.Content className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="p-name">
                        Nombre del local{" "}
                        <span style={{ color: "var(--nuba-danger)" }}>*</span>
                      </Label>
                      <Input
                        id="p-name"
                        variant="secondary"
                        {...form.register("name")}
                      />
                      {form.formState.errors.name?.message ? (
                        <Text className="text-sm text-danger">
                          {form.formState.errors.name.message}
                        </Text>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-1">
                      <Label htmlFor="p-desc">Descripción corta</Label>
                      <textarea
                        id="p-desc"
                        className="min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{
                          background: "var(--nuba-raised)",
                          borderColor: "var(--nuba-border-default)",
                          color: "var(--nuba-fg)",
                          outlineColor: "var(--nuba-accent)",
                        }}
                        maxLength={500}
                        {...form.register("description")}
                      />
                      <p
                        className="text-right text-xs"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        {String(descriptionValue ?? "").length}/500
                      </p>
                      {form.formState.errors.description?.message ? (
                        <Text className="text-sm text-danger">
                          {form.formState.errors.description.message}
                        </Text>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-1">
                      <Label htmlFor="p-email">
                        Email de contacto{" "}
                        <span style={{ color: "var(--nuba-danger)" }}>*</span>
                      </Label>
                      <Input
                        id="p-email"
                        type="email"
                        variant="secondary"
                        {...form.register("email")}
                      />
                      {form.formState.errors.email?.message ? (
                        <Text className="text-sm text-danger">
                          {form.formState.errors.email.message}
                        </Text>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="p-phone">Teléfono</Label>
                        <Input
                          id="p-phone"
                          variant="secondary"
                          {...form.register("phone")}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="p-whatsapp">WhatsApp</Label>
                        <Input
                          id="p-whatsapp"
                          variant="secondary"
                          placeholder="+54..."
                          {...form.register("whatsapp")}
                        />
                        {form.formState.errors.whatsapp?.message ? (
                          <Text className="text-sm text-danger">
                            {form.formState.errors.whatsapp.message}
                          </Text>
                        ) : null}
                      </div>
                    </div>
                  </Card.Content>
                </Card.Root>

                {/* Ubicación — condicional según cantidad de sucursales */}
                {activeBranches.length <= 1 ? (
                  <Card.Root
                    className="border border-border-subtle"
                    style={glassStyle}
                  >
                    <Card.Header>
                      <Card.Title>Ubicación</Card.Title>
                    </Card.Header>
                    <Card.Content className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="p-address">Dirección</Label>
                        <Input
                          id="p-address"
                          variant="secondary"
                          {...form.register("address")}
                        />
                      </div>
                      <GeoSelector
                        provinceValue={form.watch("province")}
                        cityValue={form.watch("city")}
                        onProvinceChange={(v) =>
                          form.setValue("province", v ?? "", {
                            shouldValidate: true,
                          })
                        }
                        onCityChange={(v) =>
                          form.setValue("city", v ?? "", {
                            shouldValidate: true,
                          })
                        }
                      />
                    </Card.Content>
                  </Card.Root>
                ) : (
                  <Card.Root
                    className="border border-border-subtle"
                    style={glassStyle}
                  >
                    <Card.Header>
                      <Card.Title>Sucursales</Card.Title>
                    </Card.Header>
                    <Card.Content className="flex flex-col gap-3">
                      <Text
                        className="text-xs"
                        style={{ color: "var(--foreground-muted)" }}
                      >
                        La ubicación se gestiona en cada sucursal.
                      </Text>
                      <ul className="flex flex-col gap-2">
                        {activeBranches.map((b) => (
                          <li key={b.id} className="flex items-center gap-2">
                            <MapPin
                              size={13}
                              style={{ color: "var(--accent)", flexShrink: 0 }}
                            />
                            <span
                              className="text-sm font-medium"
                              style={{ color: "var(--foreground)" }}
                            >
                              {b.name}
                            </span>
                            {b.city ? (
                              <span
                                className="text-xs"
                                style={{ color: "var(--foreground-muted)" }}
                              >
                                — {b.city}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <a
                        href={`/${tenantId}/panel/sucursales`}
                        className="inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: "var(--accent)" }}
                      >
                        Gestionar sucursales
                        <ArrowRight size={12} />
                      </a>
                    </Card.Content>
                  </Card.Root>
                )}

                {/* Redes sociales */}
                <Card.Root
                  className="border border-border-subtle"
                  style={glassStyle}
                >
                  <Card.Header>
                    <Card.Title>Redes sociales</Card.Title>
                  </Card.Header>
                  <Card.Content className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="p-website">Sitio web</Label>
                      <Input
                        id="p-website"
                        variant="secondary"
                        placeholder="https://..."
                        {...form.register("website")}
                      />
                      {form.formState.errors.website?.message ? (
                        <Text className="text-sm text-danger">
                          {form.formState.errors.website.message}
                        </Text>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-1">
                      <Label htmlFor="p-instagram">Instagram</Label>
                      <div className="relative">
                        <span
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm"
                          style={{ color: "var(--nuba-fg-muted)" }}
                        >
                          @
                        </span>
                        <input
                          id="p-instagram"
                          className="w-full rounded-lg border py-2 pr-3 pl-7 text-sm focus:outline-none focus:ring-2"
                          style={{
                            background: "var(--nuba-raised)",
                            borderColor: "var(--nuba-border-default)",
                            color: "var(--nuba-fg)",
                            outlineColor: "var(--nuba-accent)",
                          }}
                          placeholder="usuario"
                          {...form.register("instagram")}
                        />
                      </div>
                      {form.formState.errors.instagram?.message ? (
                        <Text className="text-sm text-danger">
                          {form.formState.errors.instagram.message}
                        </Text>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-1">
                      <Label htmlFor="p-facebook">Facebook</Label>
                      <Input
                        id="p-facebook"
                        variant="secondary"
                        placeholder="usuario o URL"
                        {...form.register("facebook")}
                      />
                      {form.formState.errors.facebook?.message ? (
                        <Text className="text-sm text-danger">
                          {form.formState.errors.facebook.message}
                        </Text>
                      ) : null}
                    </div>
                  </Card.Content>
                </Card.Root>
              </div>

              {/* Right col — 1/3 */}
              <div className="flex flex-col gap-6">
                {/* Logo */}
                <Card.Root
                  className="border border-border-subtle"
                  style={glassStyle}
                >
                  <Card.Header>
                    <Card.Title>Logo</Card.Title>
                  </Card.Header>
                  <Card.Content>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleLogoFile(f);
                        e.target.value = "";
                      }}
                    />

                    {logoUrl ? (
                      <div
                        className="relative flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-xl border"
                        style={{ borderColor: "var(--nuba-border-default)" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoUrl}
                          alt="Logo del local"
                          className="h-full w-full object-contain"
                        />
                        <button
                          type="button"
                          className="absolute top-2 right-2 rounded-full p-1 transition-opacity hover:opacity-80"
                          style={{
                            background: "var(--nuba-danger-soft)",
                            color: "var(--nuba-danger)",
                          }}
                          onClick={() =>
                            form.setValue("logo_url", "", { shouldDirty: true })
                          }
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="flex h-[200px] w-[200px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ borderColor: "var(--nuba-border-default)" }}
                        disabled={logoUploading}
                        onDrop={(e) => {
                          e.preventDefault();
                          const f = e.dataTransfer.files[0];
                          if (f) void handleLogoFile(f);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImagePlus
                          className="size-8"
                          style={{ color: "var(--nuba-fg-muted)" }}
                        />
                        <span
                          className="text-sm"
                          style={{ color: "var(--nuba-fg-muted)" }}
                        >
                          {logoUploading ? "Subiendo..." : "Subir logo"}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: "var(--nuba-fg-muted)" }}
                        >
                          jpg · png · webp · máx 2MB
                        </span>
                      </button>
                    )}
                  </Card.Content>
                </Card.Root>

                {/* Plan */}
                <Card.Root
                  className="border border-border-subtle"
                  style={glassStyle}
                >
                  <Card.Header>
                    <Card.Title>Plan actual</Card.Title>
                  </Card.Header>
                  <Card.Content className="flex flex-col gap-3">
                    {tenant ? (
                      <span
                        className="w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                        style={{
                          background: "var(--nuba-accent-soft)",
                          color: "var(--nuba-accent)",
                        }}
                      >
                        {tenant.plan}
                      </span>
                    ) : null}
                    <p
                      className="text-sm"
                      style={{ color: "var(--nuba-fg-muted)" }}
                    >
                      Para cambiar de plan contactá a Nuba
                    </p>
                    <a
                      href="mailto:soporte@nuba.ar"
                      className="flex items-center gap-1 text-sm hover:underline"
                      style={{ color: "var(--nuba-accent)" }}
                    >
                      <ExternalLink className="size-3" />
                      soporte@nuba.ar
                    </a>
                  </Card.Content>
                </Card.Root>
              </div>
            </div>

            {/* Sticky footer */}
            <div
              className="sticky bottom-0 flex justify-end rounded-xl border p-4"
              style={{
                background: "var(--nuba-surface)",
                borderColor: "var(--nuba-border-subtle)",
              }}
            >
              <Button
                type="submit"
                variant="primary"
                className="bg-accent text-accent-text"
                isDisabled={
                  !form.formState.isDirty || form.formState.isSubmitting
                }
              >
                {form.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </TabPanel>

        {/* ── Tab: Configuración ───────────────────────────────────────────── */}
        <TabPanel id="config" className="pt-6 outline-none">
          <Card.Root className="border border-border-subtle" style={glassStyle}>
            <Card.Header>
              <Card.Title>Funcionalidades activas</Card.Title>
              <Card.Description>
                Activá o desactivá las secciones disponibles para tu plan.
              </Card.Description>
            </Card.Header>
            <Card.Content className="flex flex-col">
              {FLAG_CONFIG.map(({ key, label, description }, idx) => {
                const requiresTables = key === "enable_reservations";
                const tablesEnabled = flags["enable_tables"] ?? false;
                const isDisabled = requiresTables && !tablesEnabled;
                const isMercadoPago = key === "enable_mercadopago";
                const isLoading = flagLoading[key] ?? false;
                const isLast = idx === FLAG_CONFIG.length - 1;

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 py-4"
                    style={
                      !isLast
                        ? { borderBottom: "1px solid var(--nuba-border-subtle)" }
                        : undefined
                    }
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--nuba-fg)" }}
                        >
                          {label}
                        </span>
                        {requiresTables && !tablesEnabled ? (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs"
                            style={{
                              background: "var(--nuba-warning-soft)",
                              color: "var(--nuba-warning)",
                            }}
                          >
                            Activá Mesas y salón primero
                          </span>
                        ) : null}
                        {isMercadoPago ? (
                          <a
                            href={`/${tenantId}/panel/integraciones`}
                            className="flex items-center gap-1 text-xs hover:underline"
                            style={{ color: "var(--nuba-accent)" }}
                          >
                            <ExternalLink className="size-3" />
                            Configurar cuenta
                          </a>
                        ) : null}
                      </div>
                      <span
                        className="text-xs"
                        style={{ color: "var(--nuba-fg-muted)" }}
                      >
                        {description}
                      </span>
                    </div>

                    <div
                      className={
                        isLoading ? "pointer-events-none opacity-50" : undefined
                      }
                    >
                      <SwitchRoot
                        isSelected={flags[key] ?? false}
                        isDisabled={isDisabled}
                        onChange={(v) => void onToggleFlag(key, v)}
                      >
                        <SwitchControl>
                          <SwitchThumb />
                        </SwitchControl>
                      </SwitchRoot>
                    </div>
                  </div>
                );
              })}
            </Card.Content>
          </Card.Root>
        </TabPanel>

        {/* ── Tab: Pipeline ────────────────────────────────────────────────── */}
        <TabPanel id="pipeline" className="pt-6 outline-none">
          <OrderStatusesSettingsClient tenantId={tenantId} />
        </TabPanel>
      </TabsRoot>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div>
        <div className="h-8 w-48 rounded-lg bg-raised" />
        <div className="mt-2 h-4 w-32 rounded bg-raised" />
      </div>
      <div className="flex gap-1 border-b pb-px" style={{ borderColor: "var(--nuba-border-subtle)" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-28 rounded-t bg-raised" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {[180, 120, 160].map((h, i) => (
            <div
              key={i}
              className="rounded-xl bg-raised"
              style={{ height: h }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <div className="h-52 rounded-xl bg-raised" />
          <div className="h-36 rounded-xl bg-raised" />
        </div>
      </div>
    </div>
  );
}
