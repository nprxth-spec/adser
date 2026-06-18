export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto w-full space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 w-72 rounded bg-gray-200 dark:bg-gray-850" />
        </div>
        <div className="h-10 w-24 rounded-lg bg-gray-200 dark:bg-gray-800" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
          <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 w-72 rounded bg-gray-200 dark:bg-gray-850" />
          <div className="h-9 w-full rounded-md bg-gray-200 dark:bg-gray-800" />
          <div className="h-16 w-full rounded-md bg-gray-200 dark:bg-gray-800" />
        </div>
        <div className="rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8">
          <div className="mx-auto h-12 w-12 rounded-lg bg-gray-200 dark:bg-gray-800" />
          <div className="mt-4 h-4 w-52 mx-auto rounded bg-gray-200 dark:bg-gray-850" />
          <div className="mt-2 h-4 w-40 mx-auto rounded bg-gray-200 dark:bg-gray-850" />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="h-12 border-b border-gray-100 dark:border-gray-800/50 px-4 flex items-center">
          <div className="h-4 w-36 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
        <div className="p-4 space-y-3">
          <div className="h-10 w-full rounded bg-gray-100 dark:bg-gray-800/40" />
          <div className="h-10 w-full rounded bg-gray-100 dark:bg-gray-800/40" />
          <div className="h-10 w-full rounded bg-gray-100 dark:bg-gray-800/40" />
        </div>
      </div>
    </div>
  );
}
