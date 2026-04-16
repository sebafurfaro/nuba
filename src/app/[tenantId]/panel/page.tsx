import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Package,
  Users,
} from "lucide-react";

const stats = [
  { label: "Ventas hoy", value: "$ 128.400", detail: "+12% vs. ayer" },
  { label: "Tickets abiertos", value: "18", detail: "4 esperan confirmacion" },
  { label: "Productos activos", value: "146", detail: "12 con stock bajo" },
];

const quickActions = [
  {
    title: "Cargar producto",
    description: "Agregá nuevas referencias al catalogo y ordená categorias.",
    icon: Package,
  },
  {
    title: "Revisar clientes",
    description: "Priorizá visitas, historial y seguimientos del dia.",
    icon: Users,
  },
  {
    title: "Planificar agenda",
    description: "Coordiná reservas, entregas y recordatorios del equipo.",
    icon: CalendarDays,
  },
];

const agenda = [
  { time: "09:30", title: "Control de apertura", note: "Caja, stock rapido y cocina" },
  { time: "12:00", title: "Seguimiento proveedores", note: "Confirmar entregas pendientes" },
  { time: "18:30", title: "Cierre operativo", note: "Repasar tickets y novedades" },
];

export default function PanelHomePage() {
  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-5">
      <section className="panel-glass relative overflow-hidden rounded-[32px] px-5 py-6 md:px-8 md:py-8">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-accent/10 to-transparent md:block" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-foreground-muted">
              Base layout
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Un panel claro, flexible y listo para crecer modulo por modulo.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-foreground-secondary md:text-base">
              Esta home deja una referencia visual para cards, grillas, encabezados y bloques de accion.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[30rem]">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border border-border-subtle/70 bg-surface/70 px-4 py-4"
              >
                <p className="text-xs font-medium text-foreground-muted">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
                <p className="mt-1 text-xs text-foreground-secondary">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.9fr)]">
        <div className="panel-glass rounded-[30px] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Accesos rapidos</p>
              <p className="text-sm text-foreground-secondary">
                Plantillas para mantener una UI consistente en el panel.
              </p>
            </div>
            <span className="rounded-full border border-border-subtle/70 bg-surface/65 px-3 py-1 text-xs font-medium text-foreground-secondary">
              Starter
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {quickActions.map(({ title, description, icon: Icon }) => (
              <article
                key={title}
                className="group rounded-[26px] border border-border-subtle/70 bg-surface/70 p-4 transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Icon className="size-5" />
                </div>
                <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-foreground-secondary">
                  {description}
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-accent">
                  Ver modulo
                  <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="panel-glass rounded-[30px] p-4 md:p-5">
          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-surface/80 text-foreground-secondary">
              <Clock3 className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Agenda sugerida</p>
              <p className="text-sm text-foreground-secondary">Bloques para widgets laterales.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {agenda.map((item) => (
              <div
                key={item.time}
                className="rounded-3xl border border-border-subtle/70 bg-surface/70 px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-muted">
                  {item.time}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-sm text-foreground-secondary">{item.note}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
