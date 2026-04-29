export default function AdminUsersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded bg-slate-200" />
        <div className="h-4 w-72 rounded bg-slate-200" />
        <div className="h-9 w-full rounded-xl bg-slate-200" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 space-y-3">
          <div className="h-9 rounded bg-slate-100" />
          <div className="h-9 rounded bg-slate-100" />
          <div className="h-9 rounded bg-slate-100" />
          <div className="h-9 rounded bg-slate-100" />
          <div className="h-9 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
