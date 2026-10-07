/**
 * The dashboard reads thirteen aggregates before it can render anything, so a
 * range change would otherwise leave the operator on a blank document. This
 * skeleton mirrors the real layout's grid, which is what keeps the swap from
 * shifting the page under a click.
 *
 * Purely decorative: it carries no copy (so nothing here needs translating)
 * and is hidden from assistive technology, which announces the navigation
 * itself. The pulse is switched off wholesale by the prefers-reduced-motion
 * block in globals.css.
 */
export default function AdminDashboardLoading() {
  return (
    <main
      aria-hidden
      className="mx-auto flex w-full max-w-7xl animate-pulse flex-col gap-5 p-4 sm:p-6 lg:gap-6 lg:p-8"
    >
      <div className="border-line flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="bg-cream-dark h-8 w-48 rounded-lg" />
          <div className="bg-cream-dark h-3 w-56 rounded" />
        </div>
        <div className="flex gap-3">
          <div className="bg-cream-dark h-10 w-44 rounded-full" />
          <div className="bg-cream-dark h-10 w-36 rounded-full" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-cream-dark h-9 w-28 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="border-line bg-shell h-32 rounded-xl border" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="border-line bg-shell h-64 rounded-xl border lg:col-span-2" />
        <div className="border-line bg-shell h-64 rounded-xl border" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="border-line bg-shell h-72 rounded-xl border lg:col-span-2" />
        <div className="border-line bg-shell h-72 rounded-xl border" />
      </div>
    </main>
  );
}
