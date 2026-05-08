export type ChangelogEntryType = "feature" | "fix" | "improvement";

export type ChangelogItem = {
  type: ChangelogEntryType;
  th: string;
  en: string;
};

export type ChangelogEntry = {
  version: string;
  date: string; // YYYY-MM-DD
  items: ChangelogItem[];
};

/**
 * App changelog. Add a new entry at the TOP for each release.
 * The newest entry's version is what determines the unread badge.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.3.0",
    date: "2026-05-08",
    items: [
      {
        type: "feature",
        th: "เพิ่มศูนย์แจ้งเตือน — ดูสิ่งที่อัปเดตในแต่ละเวอร์ชัน",
        en: "Added notification center — see what's new in each release",
      },
      {
        type: "feature",
        th: "แอดมินสามารถแก้ไขค่า filenameMapping ของผู้ใช้ได้จากหน้า Users",
        en: "Admins can now edit a user's filenameMapping from the Users page",
      },
      {
        type: "improvement",
        th: "ปุ่มลบในหน้า Dashboard ใช้ไดอะล็อกยืนยันแบบเดียวกับหน้า History",
        en: "Delete button on Dashboard now uses the same confirmation dialog as History",
      },
      {
        type: "fix",
        th: "ลบการเตือน 'โหลดเว็บไซต์ซ้ำ' ที่ขึ้นโดยไม่จำเป็น",
        en: "Removed the spurious 'Reload site?' prompt",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-05-05",
    items: [
      {
        type: "feature",
        th: "เพิ่ม Sheet Profiles หลายโปรไฟล์ และระบบ Review สำหรับใบแจ้งหนี้ที่ต้องตรวจ",
        en: "Added multi sheet profiles and a Review queue for invoices needing checks",
      },
      {
        type: "improvement",
        th: "ปรับปรุง UX ของ Sheet picker และ history edits",
        en: "Improved Sheet picker UX and history edit flow",
      },
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0]?.version ?? "0.0.0";
