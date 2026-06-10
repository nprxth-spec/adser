"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type UserOption = {
  id: string;
  label: string;
};

export default function AdminDashboardFilters({
  users,
  currentUserId,
  currentInterval,
}: {
  users: UserOption[];
  currentUserId?: string;
  currentInterval: "day" | "month";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateParam = (key: "userId" | "interval", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const url = params.toString() ? `/admin?${params.toString()}` : "/admin";
    startTransition(() => router.push(url));
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={currentUserId ?? ""}
        onChange={(e) => updateParam("userId", e.target.value)}
        disabled={isPending}
        className="w-64 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">All users</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.label}
          </option>
        ))}
      </select>

      <select
        value={currentInterval}
        onChange={(e) => updateParam("interval", e.target.value)}
        disabled={isPending}
        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="day">By day</option>
        <option value="month">Current month (daily)</option>
      </select>
    </div>
  );
}
