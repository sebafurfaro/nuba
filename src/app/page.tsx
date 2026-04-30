import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  LayoutGrid,
  Package,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Nuba } from "@/components/nuba/nuba";
import { Nb } from "@/components/nuba/nb";

const highlights = [
  "Reservas, mesas y calendario desde un solo lugar",
  "Control de productos, categorias, recetas y stock operativo",
  "Clientes, proveedores, sucursales y usuarios con permisos",
  "Flujo claro para cobrar, ordenar y hacer seguimiento diario",
];

const features = [
  {
    icon: CalendarDays,
    title: "Reservas y agenda centralizadas",
    description:
      "Organiza turnos, reservas y ocupacion diaria con una vista clara para recepcion y operacion.",
  },
  {
    icon: LayoutGrid,
    title: "Mesas y servicio en tiempo real",
    description:
      "Visualiza el salon, crea pedidos rapido y mueve cada mesa segun el estado del servicio.",
  },
  {
    icon: Package,
    title: "Catalogo y productos conectados",
    description:
      "Gestiona productos, categorias, recetas y ubicaciones para mantener tu oferta ordenada.",
  },
  {
    icon: Users,
    title: "Clientes y equipo en la misma plataforma",
    description:
      "Concentra historial, datos de contacto, roles y permisos para trabajar con contexto.",
  },
  {
    icon: CreditCard,
    title: "Cobros y seguimiento comercial",
    description:
      "Impulsa la operacion con procesos de venta mas prolijos y trazabilidad sobre cada orden.",
  },
  {
    icon: ShieldCheck,
    title: "Administracion lista para crecer",
    description:
      "Configura sucursales, estados, usuarios y reglas operativas sin depender de planillas sueltas.",
  },
];

const stats = [
  { value: "1", label: "plataforma para coordinar la operacion completa" },
  { value: "6+", label: "frentes de trabajo integrados en una sola vista" },
  { value: "24/7", label: "acceso para consultar y ordenar tu negocio" },
];

const steps = [
  {
    title: "Recibe y organiza",
    description:
      "Centraliza reservas, clientes y agenda para que el equipo arranque el dia con claridad.",
  },
  {
    title: "Opera sin friccion",
    description:
      "Gestiona mesas, pedidos, productos y responsables desde un flujo mas simple y visible.",
  },
  {
    title: "Controla y mejora",
    description:
      "Revisa estados, cobros, stock y administracion con informacion conectada para tomar decisiones.",
  },
];

export default function HomePage() {
  return (
    <main
      id="top"
      className="panel-shell relative isolate min-h-dvh overflow-hidden text-foreground"
    >
      <div className="panel-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.18),transparent_58%)]" />

      <div className="relative mx-auto flex min-h-dvh max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4 py-4">
          <div className="inline-flex items-end gap-2">
            <Nb />
            <Nuba />
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-border-default/70 bg-surface/80 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
          >
            Iniciar sesion
            <ArrowRight className="size-4" />
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-4 py-2 text-sm font-medium text-accent">
              <Sparkles className="size-4" />
              Todo tu negocio, mas claro y mas conectado
            </div>

            <div className="max-w-3xl space-y-5">
              <h1 className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
                La plataforma para gestionar reservas, mesas, productos y administracion desde un solo lugar.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-foreground-secondary sm:text-xl">
                Nuba ayuda a ordenar la operacion diaria de tu negocio con una experiencia unica para recepcion,
                servicio, catalogo, clientes y control interno.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {highlights.map((item) => (
                <div
                  key={item}
                  className="panel-glass flex items-start gap-3 rounded-2xl px-4 py-4"
                >
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" />
                  <p className="text-sm leading-6 text-foreground-secondary">{item}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-text transition hover:bg-accent-hover"
              >
                Entrar a la plataforma
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#recursos"
                className="inline-flex items-center justify-center rounded-2xl border border-border-default/80 bg-surface/70 px-6 py-3.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:text-accent"
              >
                Ver recursos
              </a>
            </div>
          </div>

          <div className="panel-glass relative overflow-hidden rounded-[32px] p-6 sm:p-8">
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-2xl border border-border-default/60 bg-background/55 px-4 py-3">
                <div>
                  <p className="text-sm text-foreground-secondary">Operacion del dia</p>
                  <p className="text-base font-semibold">Negocio conectado y visible</p>
                </div>
                <div className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
                  En control
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-border-default/60 bg-surface/80 p-5">
                  <p className="text-sm text-foreground-secondary">Reservas y calendario</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">Siempre al dia</p>
                  <p className="mt-3 text-sm leading-6 text-foreground-secondary">
                    Menos cruces manuales, mas orden para recibir clientes y planificar el servicio.
                  </p>
                </div>

                <div className="rounded-3xl border border-border-default/60 bg-surface/80 p-5">
                  <p className="text-sm text-foreground-secondary">Mesas y pedidos</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">Flujo agil</p>
                  <p className="mt-3 text-sm leading-6 text-foreground-secondary">
                    Un mapa operativo mas claro para atender mejor y reducir tiempos de coordinacion.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-border-default/60 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--nuba-accent)_10%,white),transparent_70%)] p-5">
                <p className="text-sm font-medium text-accent">Administracion conectada</p>
                <p className="mt-2 text-lg font-semibold">
                  Productos, clientes, proveedores y usuarios trabajando sobre la misma base.
                </p>
                <p className="mt-3 max-w-xl text-sm leading-6 text-foreground-secondary">
                  Cuando toda la informacion vive en un solo sistema, el equipo comete menos errores y responde
                  mejor en cada turno.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-y border-border-default/60 py-8 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="space-y-2">
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">{stat.value}</p>
              <p className="max-w-xs text-sm leading-6 text-foreground-secondary">{stat.label}</p>
            </div>
          ))}
        </section>

        <section id="recursos" className="py-16 sm:py-20">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-accent">
              Recursos clave
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Lo que necesitas para operar con mas orden, velocidad y contexto.
            </h2>
            <p className="text-base leading-7 text-foreground-secondary sm:text-lg">
              Nuba combina herramientas de operacion, administracion y seguimiento para que el negocio no dependa
              de planillas, mensajes dispersos o procesos improvisados.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="panel-glass rounded-[28px] p-6 transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-foreground-secondary">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-8 py-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-12">
          <div className="space-y-4">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-accent">
              Como aporta valor
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Una operacion mas simple para el equipo y una experiencia mas consistente para tus clientes.
            </h2>
            <p className="text-base leading-7 text-foreground-secondary sm:text-lg">
              Desde la primera reserva hasta el cierre del turno, la plataforma acompana cada paso con procesos
              visibles y datos mejor organizados.
            </p>
          </div>

          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.title} className="panel-glass rounded-[28px] p-6">
                <div className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-text">
                    0{index + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-foreground-secondary">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16">
          <div className="panel-glass overflow-hidden rounded-[36px] px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-4">
                <p className="text-sm font-medium uppercase tracking-[0.28em] text-accent">
                  Empieza con Nuba
                </p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Lleva tu negocio a una gestion mas profesional, clara y preparada para crecer.
                </h2>
                <p className="text-base leading-7 text-foreground-secondary">
                  Si ya tienes la plataforma lista para tu equipo, entra y empieza a trabajar con todo conectado.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-text transition hover:bg-accent-hover"
                >
                  Ir al inicio de sesion
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#top"
                  className="inline-flex items-center justify-center rounded-2xl border border-border-default/80 px-6 py-3.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:text-accent"
                >
                  Volver arriba
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
