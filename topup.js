/**
 * Top-up credits for a specific user.
 * Usage:
 *   node topup.js <email|userId> [amount]         → เพิ่ม credits (increment)
 *   node topup.js <email|userId> --set [amount]   → ตั้งค่า credits โดยตรง
 *   node topup.js --list                           → แสดงรายชื่อ users ทั้งหมด
 *
 * Examples:
 *   node topup.js user@example.com        → เพิ่ม 1000 credits ให้ user@example.com
 *   node topup.js user@example.com 500    → เพิ่ม 500 credits
 *   node topup.js user@example.com --set 9999  → ตั้งค่าเป็น 9999 credits
 *   node topup.js clxxx123abc 200         → เพิ่ม 200 credits ด้วย user id
 *   node topup.js --list                  → แสดงรายชื่อ users ทั้งหมด
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_CREDITS = 1000;

async function listUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, credits: true, plan: true },
    orderBy: { createdAt: 'desc' },
  });
  if (users.length === 0) {
    console.log('No users in database.');
    return;
  }
  console.log('Users (id, email, name, credits, plan):');
  for (const u of users) {
    console.log(`  ${u.id}  ${u.email ?? '(no email)'}  ${u.name ?? '-'}  credits:${u.credits}  plan:${u.plan}`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);

  if (args.length === 0 || args[0] === '--list' || args[0] === '-l') {
    await listUsers();
    return;
  }

  const identifier = args[0];

  // ตรวจว่าใช้ --set flag หรือไม่
  const setFlagIdx = args.indexOf('--set');
  const isSetMode = setFlagIdx !== -1;
  let amount: number;
  if (isSetMode) {
    const rawVal = args[setFlagIdx + 1];
    amount = Math.max(0, parseInt(rawVal, 10) || DEFAULT_CREDITS);
  } else {
    amount = Math.max(1, parseInt(args[1], 10) || DEFAULT_CREDITS);
  }

  const isEmail = identifier.includes('@');
  const user = await prisma.user.findFirst({
    where: isEmail
      ? { email: identifier }
      : { id: identifier },
    select: { id: true, email: true, name: true, credits: true },
  });

  if (!user) {
    console.error(
      isEmail
        ? `User not found with email: ${identifier}`
        : `User not found with id: ${identifier}`
    );
    process.exit(1);
  }

  if (isSetMode) {
    // ตั้งค่า credits โดยตรง
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { credits: amount },
      select: { credits: true },
    });
    console.log(
      `SET: ${user.email ?? user.id} (${user.name ?? 'no name'}) → ${updated.credits} credits (was ${user.credits})`
    );
  } else {
    // เพิ่ม credits (increment) — ไม่ลบ credits ที่มีอยู่
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { credits: { increment: amount } },
      select: { credits: true },
    });
    console.log(
      `ADD: ${user.email ?? user.id} (${user.name ?? 'no name'}) +${amount} credits → ${updated.credits} total (was ${user.credits})`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
