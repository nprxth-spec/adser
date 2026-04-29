export default function SettingsLoading() {
  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded bg-slate-200" />
        <div className="h-4 w-96 rounded bg-slate-200" />
      </div>

      <div className="h-40 rounded-2xl border border-slate-200 bg-white" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-36 rounded-2xl border border-slate-200 bg-white" />
        <div className="h-36 rounded-2xl border border-slate-200 bg-white" />
      </div>
      <div className="h-40 rounded-2xl border border-slate-200 bg-white" />
      <div className="h-32 rounded-2xl border border-red-100 bg-white" />
    </div>
  );
}
