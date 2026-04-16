import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-12">
      <h1 className="text-4xl font-bold tracking-tight">Nuba</h1>
      <p className="max-w-md text-center text-lg text-default-600">
        Plataforma para tu negocio: reservas, mesas, productos y más.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Ir al inicio de sesión
      </Link>
    </div>
  );
}
