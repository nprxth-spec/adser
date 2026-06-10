"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = Record<string, string | number>;
type ChartUser = { userId: string; label: string };

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function AdminDashboardChart({
  data,
  interval,
  users,
}: {
  data: ChartPoint[];
  interval: "day" | "month";
  users: ChartUser[];
}) {
  if (data.length === 0 || users.length === 0) {
    return <p className="text-sm text-gray-500">No chart data for this filter.</p>;
  }

  const palette = [
    "#14b8a6",
    "#0ea5e9",
    "#8b5cf6",
    "#f59e0b",
    "#ef4444",
    "#22c55e",
    "#6366f1",
    "#f97316",
    "#06b6d4",
    "#84cc16",
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-medium text-gray-600">Uploads by user</p>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#475569" }}
                tickFormatter={(value) =>
                  interval === "month" ? String(value).slice(2) : String(value).slice(5)
                }
              />
              <YAxis tick={{ fontSize: 12, fill: "#475569" }} allowDecimals={false} />
              <Tooltip
                formatter={(value) => [Number(value).toLocaleString(), "Uploads"]}
                labelFormatter={(value) => `Period: ${value}`}
              />
              <Legend />
              {users.map((user, idx) => (
                <Bar
                  key={user.userId}
                  dataKey={`count_${user.userId}`}
                  name={user.label}
                  fill={palette[idx % palette.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-gray-600">Amount by user</p>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#475569" }}
                tickFormatter={(value) =>
                  interval === "month" ? String(value).slice(2) : String(value).slice(5)
                }
              />
              <YAxis tick={{ fontSize: 12, fill: "#475569" }} />
              <Tooltip
                formatter={(value) => [formatAmount(Number(value)), "Amount"]}
                labelFormatter={(value) => `Period: ${value}`}
              />
              <Legend />
              {users.map((user, idx) => (
                <Bar
                  key={user.userId}
                  dataKey={`amount_${user.userId}`}
                  name={user.label}
                  fill={palette[idx % palette.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
