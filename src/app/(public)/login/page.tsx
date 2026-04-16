import { Suspense } from "react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-12">
      <Suspense
        fallback={
          <div className="text-sm text-default-500">Cargando formulario…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </section>
  );
}
