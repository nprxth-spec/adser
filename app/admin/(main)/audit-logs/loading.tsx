export default function AdminAuditLogsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded bg-slate-200" />
        <div className="h-9 w-full rounded-lg bg-slate-200" />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 space-y-3">
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
