export default function HistoryLoading() {
  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-44 rounded bg-slate-200" />
          <div className="h-4 w-64 rounded bg-slate-200" />
        </div>
        <div className="h-9 w-52 rounded-xl bg-slate-200" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 space-y-3">
          <div className="h-12 w-full rounded bg-slate-100" />
          <div className="h-12 w-full rounded bg-slate-100" />
          <div className="h-12 w-full rounded bg-slate-100" />
          <div className="h-12 w-full rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
