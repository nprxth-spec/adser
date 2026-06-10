export default function BillingLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 w-full animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="h-4 w-80 rounded bg-gray-200" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="h-28 rounded-xl bg-gray-100" />
          <div className="h-28 rounded-xl bg-gray-100" />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <div className="h-4 w-48 rounded bg-gray-200" />
        <div className="h-10 rounded-lg bg-gray-100" />
        <div className="h-10 rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}
