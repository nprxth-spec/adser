/**
 * fix-filenames.mjs
 *
 * แก้ไขชื่อไฟล์ใน ProcessingLog + Google Drive ที่ยังไม่มี card prefix
 *
 * รันด้วย:
 *   node fix-filenames.mjs                ← dry run (ดูตัวอย่างก่อน)
 *   node fix-filenames.mjs --apply        ← แก้ไขจริง DB + Drive
 *   node fix-filenames.mjs --db-only      ← แก้เฉพาะ DB (ไม่ต้องการ token)
 *   node fix-filenames.mjs --drive-only   ← แก้เฉพาะ Drive (DB แก้แล้ว)
 *   node fix-filenames.mjs --check        ← ตรวจดูสถานะทั้งหมด (ไม่แก้ไข)
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── โหลด .env.local ───────────────────────────────────────────────────────────
function loadEnv(path) {
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {}
}
loadEnv(resolve(process.cwd(), ".env.local"));
loadEnv(resolve(process.cwd(), ".env"));

// ── User email เจ้าของไฟล์ ────────────────────────────────────────────────────
const TARGET_USER_EMAIL = "thailand.sh00268@gmail.com";
// ── User email ที่ใช้ token สำหรับ Drive (ถ้าต่างจาก TARGET_USER_EMAIL) ────────
// override ได้ด้วย: node fix-filenames.mjs --drive-only --token-user=nprxth@gmail.com
const TOKEN_USER_EMAIL_ARG = process.argv.find(a => a.startsWith("--token-user="))?.split("=")[1] ?? null;

// ── Card mapping (last4 → prefix) ─────────────────────────────────────────────
const CARD_MAP = {
  "8958": "AC-0004-9",
  "2465": "AC-0012-4",
  "0533": "AC-0015-23",
  "4277": "AC-0015-3",
  "7983": "AC-0015-4",
  "0060": "AC-0015-5",
  "4021": "AC-0015-6",
  "8081": "AC-0016-1",
  "5331": "AC-0016-11",
  "6454": "AC-0016-19",
  "2905": "AC-0016-2",
  "7224": "AC-0016-22",
  "7768": "AC-0016-3",
  "8064": "AC-0024-1",
  "8644": "AC-0024-22",
  "0814": "AC-0024-29",
  "0871": "AC-0026-10",
  "3974": "AC-0026-21",
  "3180": "AC-0026-29",
  "8725": "AC-0026-39",
  "8021": "AC-0026-4",
  "1454": "AC-0029-11",
  "7786": "AC-0029-4",
  "7355": "AC-0030-15",
  "5506": "AC-0032-15",
  "2561": "AC-0032-18",
  "7398": "AC-0032-22",
  "9299": "AC-0032-31",
  "0853": "AC-0033-13",
  "1323": "AC-0033-16",
  "7562": "AC-0033-22",
  "2400": "AC-0033-5",
  "7049": "AC-0036-2",
  "9402": "AC-0036-3",
  "3618": "AC-0042-13",
  "0498": "AC-0042-6",
  "1954": "AC-0043-4",
  "0673": "AC-0047-11",
  "0357": "AC-0048-21",
  "3048": "AC-0048-23",
  "2818": "AC-0048-40",
  "0181": "AC-0048-8",
  "7471": "AC-0050-20",
  "5159": "AC-0050-3",
  "1788": "AC-0053-17",
  "2778": "AC-0053-24",
  "1572": "AC-0053-6",
  "5346": "AC-0053-9",
  "8188": "AC-0056-10",
  "6343": "AC-0056-13",
  "7945": "AC-0056-14",
  "4658": "AC-0056-21",
  "8105": "PF-0003-4",
  "5900": "PF-0005-1",
  "2308": "PF-0006-10",
  "2901": "PF-0006-2",
  "1842": "RED-0203",
  "3494": "RED-0304",
  "9532": "WF-0012-3",
  "5005": "WF-0012-4",
  "8457": "WF-0026-2",
  "0662": "WF-0028-2",
  "8202": "WF-0029-16",
  "0008": "WF-0037-12",
  "3805": "WF-0037-8",
  "3526": "WF-0039-3",
  "2107": "WF-0040-15",
  "1496": "WF-0040-9",
  "5175": "WF-0044-1",
  "1936": "WF-0044-13",
  "0863": "WF-0044-14",
  "3826": "WF-0044-2",
  "5651": "WF-0044-3",
  "0761": "WF-0045-25",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDriveFileId(driveLink) {
  if (!driveLink) return null;
  return driveLink.match(/\/file\/d\/([^\/\?]+)/)?.[1] ?? null;
}

function buildFixedFilename(prefix, currentFilename) {
  if (currentFilename.startsWith("- ")) {
    return `${prefix} ${currentFilename}`;
  }
  return `${prefix} - ${currentFilename}`;
}

/** ดึง / refresh Google access token ของ user คนนี้ */
async function getValidToken(prisma, userId) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true, scope: true },
  });
  if (!account) { console.error("❌ ไม่พบ Google account ใน DB สำหรับ user นี้"); return null; }

  // แสดง scope ที่มีอยู่
  console.log(`   Scope: ${account.scope ?? "(ไม่ระบุ)"}`);

  const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;
  const needsRefresh = !expiresAt || Date.now() >= expiresAt - 5 * 60 * 1000;

  if (!needsRefresh && account.access_token) {
    console.log("   Token: ยังใช้ได้อยู่");
    return account.access_token;
  }

  if (!account.refresh_token) {
    console.error("❌ ไม่มี refresh_token — user ต้อง sign in ใหม่ก่อน");
    return null;
  }

  console.log("   Token: หมดอายุ กำลัง refresh...");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });
  const tokens = await res.json();
  if (!res.ok) {
    console.error("❌ Token refresh ล้มเหลว:", JSON.stringify(tokens));
    return null;
  }

  await prisma.account.updateMany({
    where: { userId, provider: "google" },
    data: {
      access_token: tokens.access_token,
      expires_at: Math.floor((Date.now() + (tokens.expires_in ?? 3600) * 1000) / 1000),
      ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
    },
  });
  console.log("   Token: refresh สำเร็จ ✅");
  return tokens.access_token;
}

/** เปลี่ยนชื่อไฟล์ใน Google Drive */
async function renameDriveFile(fileId, newName, accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Drive API ${res.status}: ${err?.error?.message ?? "unknown"}`);
  }
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const prisma = new PrismaClient();
  const args = process.argv.slice(2);
  const dryRun    = !args.includes("--apply") && !args.includes("--drive-only") && !args.includes("--db-only") && !args.includes("--check");
  const driveOnly = args.includes("--drive-only");
  const dbOnly    = args.includes("--db-only");
  const checkOnly = args.includes("--check");

  try {
    // ── หา user ตาม email ──────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { email: TARGET_USER_EMAIL },
      select: { id: true, email: true, filenameMapping: true },
    });
    if (!user) {
      console.error(`❌ ไม่พบ user: ${TARGET_USER_EMAIL}`);
      process.exit(1);
    }
    console.log(`👤 User: ${user.email} (id: ${user.id})\n`);

    // ── ดึง token (ยกเว้น --check และ --db-only ไม่ต้องการ token) ────────────
    let accessToken = null;
    if (!checkOnly && !dbOnly) {
      // ถ้าระบุ --token-user ให้ใช้ token ของ user นั้นแทน
      let tokenUserId = user.id;
      if (TOKEN_USER_EMAIL_ARG) {
        const tokenUser = await prisma.user.findUnique({
          where: { email: TOKEN_USER_EMAIL_ARG },
          select: { id: true, email: true },
        });
        if (!tokenUser) {
          console.error(`❌ ไม่พบ token-user: ${TOKEN_USER_EMAIL_ARG}`);
          process.exit(1);
        }
        tokenUserId = tokenUser.id;
        console.log(`🔑 ใช้ token ของ: ${tokenUser.email}`);
      } else {
        console.log("🔑 ตรวจสอบ Google token...");
      }
      accessToken = await getValidToken(prisma, tokenUserId);
      if (!accessToken) {
        console.error("\n⛔ ไม่สามารถดึง token ได้");
        console.error("   → Sign out แล้ว Sign in ใหม่ที่ http://localhost:3000 หรือ https://files-go.vercel.app");
        console.error("   → หรือรัน --db-only เพื่อแก้ DB ก่อนโดยไม่ต้องการ token");
        process.exit(1);
      }
      console.log();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MODE: --drive-only
    // ดึง log ที่ DB ชื่อถูกแล้ว (มี prefix) แต่ Drive อาจยังไม่ถูก
    // ══════════════════════════════════════════════════════════════════════════
    if (driveOnly) {
      console.log("🔄 โหมด --drive-only: แก้ชื่อไฟล์ใน Drive ให้ตรงกับ DB\n");

      const logs = await prisma.processingLog.findMany({
        where: {
          userId: user.id,
          cardLast4: { in: Object.keys(CARD_MAP) },
          driveLink: { not: null },
        },
        select: { id: true, filename: true, cardLast4: true, driveLink: true },
        orderBy: { createdAt: "asc" },
      });

      console.log(`พบ log ที่มี driveLink: ${logs.length} รายการ\n`);

      let driveOk = 0, driveErr = 0, driveSkip = 0;

      for (const log of logs) {
        const fileId = extractDriveFileId(log.driveLink);
        if (!fileId) { driveSkip++; continue; }

        // ชื่อที่ควรเป็น = ชื่อใน DB (ซึ่งแก้แล้ว)
        const targetName = log.filename;

        try {
          await renameDriveFile(fileId, targetName, accessToken);
          console.log(`✅ [${log.id.slice(0, 8)}] Drive → "${targetName}"`);
          driveOk++;
        } catch (err) {
          console.error(`❌ [${log.id.slice(0, 8)}] Drive: ${err.message}`);
          console.error(`   filename: "${log.filename}"`);
          driveErr++;
        }
      }

      console.log(`\n${"═".repeat(40)}`);
      console.log(`Drive ✅ ${driveOk}  ❌ ${driveErr}  ⚠️ ข้าม ${driveSkip}`);
      console.log(`${"═".repeat(40)}`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MODE: --check
    // ดูสถานะ log ทั้งหมดของ user — ไม่แก้ไขอะไร
    // ══════════════════════════════════════════════════════════════════════════
    if (checkOnly) {
      console.log("🔎 โหมด --check: ตรวจสอบสถานะ log ทั้งหมด\n");

      const allLogs = await prisma.processingLog.findMany({
        where: { userId: user.id },
        select: { id: true, filename: true, cardLast4: true, driveLink: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      const PREFIX_RE = /^[A-Z]{2,3}-\d{4}-?\d*\s/;

      let countOk = 0, countNeedFix = 0, countUnknownCard = 0, countNoCard = 0;
      const needFix = [];
      const unknownCards = new Set();

      for (const log of allLogs) {
        if (!log.cardLast4) { countNoCard++; continue; }
        const expectedPrefix = CARD_MAP[log.cardLast4];
        if (!expectedPrefix) { countUnknownCard++; unknownCards.add(log.cardLast4); continue; }
        if (log.filename.startsWith(expectedPrefix + " ")) { countOk++; continue; }
        countNeedFix++;
        needFix.push({ ...log, expectedPrefix });
      }

      console.log(`✅ ถูกต้องแล้ว:            ${countOk}`);
      console.log(`🔧 ยังต้องแก้ไข:           ${countNeedFix}`);
      console.log(`❓ card ไม่อยู่ใน mapping: ${countUnknownCard}${unknownCards.size ? ` (${[...unknownCards].join(", ")})` : ""}`);
      console.log(`⬜ ไม่มี cardLast4:         ${countNoCard}`);

      if (needFix.length > 0) {
        console.log(`\nตัวอย่างรายการที่ยังผิด (${Math.min(5, needFix.length)}/${needFix.length}):`);
        for (const log of needFix.slice(0, 5)) {
          console.log(`  [${log.cardLast4}→${log.expectedPrefix}] "${log.filename.slice(0, 60)}..."`);
        }
        console.log(`\n→ รัน: node fix-filenames.mjs --apply`);
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MODE: --apply / dry-run
    // ══════════════════════════════════════════════════════════════════════════
    console.log("🔍 กำลังค้นหา ProcessingLog ที่ต้องแก้ไข...\n");

    const logs = await prisma.processingLog.findMany({
      where: {
        userId: user.id,
        cardLast4: { in: Object.keys(CARD_MAP) },
      },
      select: { id: true, filename: true, cardLast4: true, driveLink: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    console.log(`พบ log ที่มี cardLast4 ตรงกับ mapping: ${logs.length} รายการ\n`);

    const toFix = [];
    let alreadyCorrect = 0;

    for (const log of logs) {
      const prefix = CARD_MAP[log.cardLast4];
      if (!prefix) continue;
      if (log.filename.startsWith(prefix + " ")) { alreadyCorrect++; continue; }
      toFix.push({ ...log, prefix });
    }

    console.log(`✅ ถูกต้องแล้ว:   ${alreadyCorrect} รายการ`);
    console.log(`🔧 ต้องแก้ไข:     ${toFix.length} รายการ\n`);

    if (toFix.length === 0) {
      console.log("ไม่มีรายการที่ต้องแก้ไขใน DB แล้ว!");
      console.log("ถ้า Drive ยังไม่ถูก ให้รัน: node fix-filenames.mjs --drive-only");
      return;
    }

    // Preview
    let driveCount = 0;
    for (const log of toFix) {
      const newFilename = buildFixedFilename(log.prefix, log.filename);
      const fileId = extractDriveFileId(log.driveLink);
      if (fileId) driveCount++;
      if (dryRun) {
        console.log(`[${log.cardLast4} → ${log.prefix}]`);
        console.log(`  ก่อน: ${log.filename}`);
        console.log(`  หลัง: ${newFilename}`);
        console.log(`  Drive: ${fileId ? `fileId=${fileId}` : "⚠️ ไม่มี driveLink"}`);
        console.log();
      }
    }

    if (dryRun) {
      console.log(`📁 Drive ที่จะเปลี่ยนชื่อ: ${driveCount} ไฟล์`);
      console.log("\n═══════════════════════════════════════════════════════════");
      console.log("⚠️  DRY RUN — ยังไม่ได้แก้ไขจริง");
      console.log("   รัน: node fix-filenames.mjs --apply  เพื่อแก้ไขจริง");
      console.log("═══════════════════════════════════════════════════════════");
      return;
    }

    // Apply
    console.log("🚀 กำลังแก้ไข...\n");
    let dbOk = 0, dbErr = 0, driveOk = 0, driveErr = 0, driveSkip = 0;

    for (const log of toFix) {
      const newFilename = buildFixedFilename(log.prefix, log.filename);
      const fileId = extractDriveFileId(log.driveLink);

      // 1. แก้ DB
      try {
        await prisma.processingLog.update({
          where: { id: log.id },
          data: { filename: newFilename },
        });
        console.log(`✅ DB  [${log.id.slice(0, 8)}] "${log.filename}"`);
        console.log(`          → "${newFilename}"`);
        dbOk++;
      } catch (err) {
        console.error(`❌ DB  [${log.id.slice(0, 8)}] Error: ${err.message}`);
        dbErr++;
        continue;
      }

      // 2. แก้ Drive (ข้ามถ้า --db-only)
      if (dbOnly) { console.log(); continue; }
      if (!fileId) { console.log(`   Drive: ⚠️  ข้าม — ไม่มี driveLink`); driveSkip++; console.log(); continue; }
      try {
        await renameDriveFile(fileId, newFilename, accessToken);
        console.log(`   Drive: ✅ เปลี่ยนชื่อสำเร็จ`);
        driveOk++;
      } catch (err) {
        console.error(`   Drive: ❌ ${err.message}`);
        driveErr++;
      }
      console.log();
    }

    // อัปเดต filenameMapping
    console.log("📝 กำลังอัปเดต filenameMapping ใน User...");
    try {
      const merged = { ...(user.filenameMapping ?? {}), ...CARD_MAP };
      await prisma.user.update({
        where: { id: user.id },
        data: { filenameMapping: merged },
      });
      console.log(`✅ filenameMapping อัปเดตแล้ว (${Object.keys(merged).length} rules)`);
    } catch (err) {
      console.error("❌ อัปเดต filenameMapping ไม่สำเร็จ:", err.message);
    }

    console.log(`\n${"═".repeat(40)}`);
    console.log(`DB    ✅ ${dbOk}  ❌ ${dbErr}`);
    console.log(`Drive ✅ ${driveOk}  ❌ ${driveErr}  ⚠️ ข้าม ${driveSkip}`);
    if (driveErr > 0) {
      console.log(`\n⚠️  Drive ยังมีข้อผิดพลาด ${driveErr} รายการ`);
      console.log(`   Sign out → Sign in ใหม่ที่ https://files-go.vercel.app`);
      console.log(`   แล้วรัน: node fix-filenames.mjs --drive-only`);
    }
    console.log(`${"═".repeat(40)}`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
