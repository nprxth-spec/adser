const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const accounts = await prisma.account.findMany({});
  console.log("Accounts in database:", JSON.stringify(accounts, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
