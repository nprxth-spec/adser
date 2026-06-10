export default function ConnectorsLoading() {
  return (
    <div className="max-w-4xl mx-auto pb-12 w-full min-w-0 space-y-4 animate-pulse">
      <div className="space-y-2 mb-4">
        <div className="h-7 w-44 rounded bg-gray-200" />
        <div className="h-4 w-96 rounded bg-gray-200" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-28 rounded-3xl bg-white border border-gray-100" />
        <div className="h-28 rounded-3xl bg-white border border-gray-100" />
      </div>
      <div className="h-64 rounded-3xl bg-white border border-gray-100" />
    </div>
  );
}
