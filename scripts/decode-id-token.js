const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const account = await prisma.account.findFirst({});
  if (account && account.id_token) {
    const parts = account.id_token.split(".");
    if (parts[1]) {
      const payload = Buffer.from(parts[1], "base64").toString("utf-8");
      console.log("ID Token Payload:", JSON.parse(payload));
    }
  } else {
    console.log("No account or id_token found.");
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
