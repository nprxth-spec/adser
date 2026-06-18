import { prisma } from "@/lib/prisma";
import AdminUserScopesCell from "./AdminUserScopesCell";
import AdminDeleteUserButton from "./AdminDeleteUserButton";
import AdminTruncatedCell from "./AdminTruncatedCell";
import AdminFilenameMappingEditor from "./AdminFilenameMappingEditor";
import AdminSheetMappingEditor from "./AdminSheetMappingEditor";
import LogsRangeSelect from "../logs/LogsRangeSelect";
import { LogsSearchClient } from "../logs/LogsSearchClient";



type DateRangePreset = "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "this_year";

function getDateRange(range: DateRangePreset): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  let from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (range) {
    case "today":
      break;
    case "yesterday": {
      from.setDate(from.getDate() - 1);
      to.setTime(from.getTime());
      to.setHours(23, 59, 59, 999);
      break;
    }
    case "this_week": {
      const day = from.getDay();
      const monday = day === 0 ? -6 : 1 - day;
      from.setDate(from.getDate() + monday);
      break;
    }
    case "this_month":
      from.setDate(1);
      break;
    case "last_month": {
      from.setMonth(from.getMonth() - 1);
      from.setDate(1);
      to.setTime(from.getTime());
      to.setMonth(to.getMonth() + 1);
      to.setDate(0);
      to.setHours(23, 59, 59, 999);
      break;
    }
    case "this_year":
      from.setMonth(0, 1);
      break;
    default:
      return { from: new Date(0), to: new Date(8640000000000000) };
  }
  return { from, to };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; q?: string }>;
}) {
  const params = await searchParams;
  const range = (params.range ?? "all") as DateRangePreset | "all";
  const query = (params.q ?? "").trim();

  const where: any = {};
  const validPresets: DateRangePreset[] = [
    "today",
    "yesterday",
    "this_week",
    "this_month",
    "last_month",
    "this_year",
  ];
  if (range && range !== "all" && validPresets.includes(range)) {
    const { from, to } = getDateRange(range);
    where.createdAt = { gte: from, lte: to };
  }

  if (query) {
    where.OR = [
      { email: { contains: query, mode: "insensitive" } },
      { name: { contains: query, mode: "insensitive" } },
      { sheetId: { contains: query, mode: "insensitive" } },
      { sheetName: { contains: query, mode: "insensitive" } },
      { driveFolderId: { contains: query, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      sheetId: true,
      sheetName: true,
      sheetMapping: true,
      filenameMapping: true,
      driveFolderId: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Users</h1>
          <LogsRangeSelect basePath="/admin/users" currentRange={range} dateLabel="Date:" />
        </div>
        <LogsSearchClient
          basePath="/admin/users"
          placeholder="Search by email, name, sheet, or Drive folder"
        />
      </div>
      <p className="text-sm text-gray-500">Manage registered users. Changes apply immediately.</p>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap w-12">#</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Email</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">sheetId</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">sheetName</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">sheetMapping</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">filenameMapping</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">driveFolderId</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">สิทธิ์ Google</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => {
                return (
                  <tr key={user.id} className="border-b border-gray-100">
                    <td className="px-4 py-2 text-gray-500 tabular-nums whitespace-nowrap">
                      {i + 1}
                    </td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{user.email ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{user.name ?? "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <AdminTruncatedCell value={user.sheetId} />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <AdminTruncatedCell value={user.sheetName} />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <AdminSheetMappingEditor
                        userId={user.id}
                        userLabel={user.email ?? user.name ?? user.id}
                        value={user.sheetMapping}
                      />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <AdminFilenameMappingEditor
                        userId={user.id}
                        userLabel={user.email ?? user.name ?? user.id}
                        value={user.filenameMapping}
                      />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <AdminTruncatedCell value={user.driveFolderId} />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <AdminUserScopesCell userId={user.id} />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <AdminDeleteUserButton
                          userId={user.id}
                          userLabel={user.email ?? user.name ?? user.id}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
