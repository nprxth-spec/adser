export default function AdminDashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 rounded bg-slate-200" />
        <div className="h-9 w-64 rounded-xl bg-slate-200" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="h-24 rounded-xl border border-slate-200 bg-white" />
        <div className="h-24 rounded-xl border border-slate-200 bg-white" />
        <div className="h-24 rounded-xl border border-slate-200 bg-white" />
      </div>

      <div className="h-64 rounded-xl border border-slate-200 bg-white" />
      <div className="h-[420px] rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
