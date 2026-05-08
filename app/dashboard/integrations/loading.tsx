export default function IntegrationsLoading() {
  return (
    <div className="max-w-3xl mx-auto pb-12 w-full min-w-0 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-slate-200" />
        <div className="h-4 w-80 rounded bg-slate-200" />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="h-10 w-full rounded-lg bg-slate-100" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-3 h-10 rounded-lg bg-slate-100" />
          <div className="md:col-span-2 h-10 rounded-lg bg-slate-100" />
        </div>
        <div className="h-48 rounded-lg bg-slate-100" />
        <div className="h-10 w-44 rounded-lg bg-slate-200 ml-auto" />
      </div>
    </div>
  );
}
