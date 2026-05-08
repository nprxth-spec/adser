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
    version: "1.4.0",
    date: "2026-05-08",
    items: [
      {
        type: "feature",
        th: "หน้าวิเคราะห์การใช้จ่ายใหม่ — ดูยอดรวม จำนวนใบแจ้งหนี้ ค่าเฉลี่ยต่อใบ พร้อมกราฟรายเดือน (เลือกปีได้) กราฟรายวัน และโดนัทสัดส่วนบัตร",
        en: "New Spend Analytics page — total spend, invoice count, average per invoice, plus a year-selectable monthly chart, daily chart, and a per-card donut",
      },
      {
        type: "feature",
        th: "อัปโหลดหลายไฟล์พร้อมกัน — ประมวลผลแบบขนาน รวดเร็วกว่าเดิมหลายเท่า ไม่ต้องรอทีละไฟล์อีกต่อไป",
        en: "Parallel uploads — multiple files now process at the same time, dramatically faster than the old one-at-a-time flow",
      },
      {
        type: "feature",
        th: "จัดเก็บไฟล์ใน Google Drive อัตโนมัติ — ระบบสร้างโฟลเดอร์ ปี / เดือน / วัน ให้ตามวันที่ใบเสร็จ ไม่ต้องเลือกปลายทางเอง",
        en: "Auto-organized Google Drive — files are filed under year / month / day folders by receipt date, no manual destination needed",
      },
      {
        type: "feature",
        th: "ตั้งชื่อไฟล์อัตโนมัติ — ระบบจัดรูปแบบชื่อให้สม่ำเสมอและอ่านง่าย โดยไม่ต้องตั้งค่ารูปแบบเอง",
        en: "Auto filename formatting — clean, consistent filenames generated for you with zero configuration",
      },
      {
        type: "feature",
        th: "คิวตรวจสอบใบแจ้งหนี้ — ไฟล์ที่ข้อมูลไม่ครบจะรอให้คุณยืนยันและแก้ไขก่อน จึงค่อยบันทึกลงฐานข้อมูลและ Google Sheet",
        en: "Review queue — invoices with missing fields wait for your confirmation and edits before they're committed to the database and Google Sheet",
      },
      {
        type: "feature",
        th: "แก้ไขประวัติได้ — ปรับแก้รายการในหน้า History แล้วระบบจะอัปเดตทั้งฐานข้อมูลและ Google Sheet ให้ตรงกันอัตโนมัติ",
        en: "Editable history — update any record on the History page and the change syncs to both the database and your Google Sheet",
      },
      {
        type: "feature",
        th: "เพิ่มศูนย์แจ้งเตือน — ดูสิ่งที่อัปเดตในแต่ละเวอร์ชันได้จากไอคอนกระดิ่งใน Sidebar",
        en: "Added notification center — see what's new in each release from the bell icon in the sidebar",
      },
      {
        type: "improvement",
        th: "ปุ่มลบในหน้า Dashboard ใช้ไดอะล็อกยืนยันแบบเดียวกับหน้า History เพื่อความสม่ำเสมอ",
        en: "Delete button on Dashboard now uses the same confirmation dialog as History for a consistent experience",
      },
      {
        type: "improvement",
        th: "ปรับปรุงไดอะล็อก 'มีอะไรใหม่' ให้แสดงทับ element อื่นเสมอ",
        en: "The 'What's new' dialog now reliably renders above other elements",
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
