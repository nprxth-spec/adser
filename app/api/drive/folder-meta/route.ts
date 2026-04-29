import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getValidGoogleAccessToken } from "@/lib/google-auth";

const CACHE_REVALIDATE_SECONDS = 600; // 10 นาที
const PICKER_ROOT_FOLDER_ID = "11-naB49cPhno_HpKcTbrmYPhNz_R8oJk";

/**
 * สร้าง breadcrumb path จาก folder ID
 *
 * @param leafName  ชื่อโฟลเดอร์ปลายทางที่รู้แล้ว (จาก picker) — ถ้ามีจะข้าม 1 API call
 * @param startId   ID ที่จะเริ่ม traverse — ถ้ามี leafName ให้ส่ง parentId มาแทน
 */
async function fetchFolderMeta(
  userId: string,
  id: string,
  leafName?: string,
  startId?: string
) {
  const accessToken = await getValidGoogleAccessToken(userId);
  if (!accessToken) throw new Error("Google access token missing");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  // ถ้ารู้ leafName แล้ว ใส่ไว้ก่อนเลย แล้วเริ่ม traverse จาก parent
  const names: string[] = leafName ? [leafName] : [];
  let currentId: string | null = startId ?? id;
  let guard = 0;

  while (currentId && guard < 10) {
    guard += 1;

    const res: any = await drive.files.get({
      fileId: currentId,
      fields: "id, name, parents",
      supportsAllDrives: true,
    });

    const name: string = res.data.name || currentId;
    names.unshift(name);

    if (currentId === PICKER_ROOT_FOLDER_ID) break;

    const parents: string[] | undefined = res.data.parents;
    if (!parents || parents.length === 0) break;
    currentId = parents[0] ?? null;
  }

  const fullPath = names.join(" / ");
  return { id, name: names[names.length - 1] ?? leafName ?? "", path: fullPath };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // hints จาก Google Picker (ถ้ามี ช่วยลด API calls ได้ 1-2 ครั้ง)
  const leafName = searchParams.get("leafName") ?? undefined;
  const parentId = searchParams.get("parentId") ?? undefined;

  const userId = session.user.id;

  // cache key รวม hints ด้วย เพื่อให้ตรงกับ args ที่ส่งไป
  const cacheKey = [userId, id, leafName ?? "", parentId ?? ""].join(":");

  try {
    const data = await unstable_cache(
      () => fetchFolderMeta(userId, id, leafName, parentId),
      ["folder-meta-v2", cacheKey],
      { revalidate: CACHE_REVALIDATE_SECONDS, tags: [`user-folder-${userId}`] }
    )();
    return NextResponse.json({ data });
  } catch (err: any) {
    console.error("Failed to fetch folder metadata:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch folder metadata" },
      { status: 500 }
    );
  }
}

