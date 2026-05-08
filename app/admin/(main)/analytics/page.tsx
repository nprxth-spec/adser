import { prisma } from "@/lib/prisma";
import AdminAnalyticsClient from "./AdminAnalyticsClient";

export default async function AdminAnalyticsPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true },
  });
  return <AdminAnalyticsClient users={users.map((u) => ({
    id: u.id,
    label: u.email ?? u.name ?? u.id,
  }))} />;
}
