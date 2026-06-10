export default function NamingLoading() {
  return (
    <div className="max-w-3xl mx-auto pb-12 w-full min-w-0 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-52 rounded bg-gray-200" />
        <div className="h-4 w-96 rounded bg-gray-200" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="h-14 rounded-lg bg-gray-100" />
        <div className="h-24 rounded-lg bg-gray-100" />
        <div className="h-20 rounded-lg bg-gray-100" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <div className="h-4 w-60 rounded bg-gray-200" />
        <div className="h-28 rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}
