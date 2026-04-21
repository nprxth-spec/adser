import { prisma } from "./lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      filenameMapping: true,
      auditLogs: {
        where: { type: "config_naming" },
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });

  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
