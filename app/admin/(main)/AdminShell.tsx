"use client";

import { useState } from "react";
import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gray-100 flex dark:bg-gray-900">
      <AdminSidebar isOpen={sidebarOpen} />
      <div className="flex-1 min-w-0 flex flex-col">
        <AdminHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />
        <main className="flex-1 min-w-0 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
