/**
 * /termos — Terms of Service stub. Real content TBD in Phase 13b.
 */

export const metadata = {
  title: "Termos — AutoAgente",
};

export default function TermosPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16 text-slate-900 dark:text-slate-100">
      <h1
        className="text-3xl font-semibold tracking-tight"
        style={{ fontFamily: "var(--font-fraunces, Georgia, serif)" }}
      >
        Termos de Uso
      </h1>
      <p className="mt-4 text-slate-600 dark:text-slate-300">
        Em construção. Termos comerciais (assinatura, success fee, rescisão, SLA) serão publicados
        antes do go-live com tráfego real.
      </p>
    </main>
  );
}
