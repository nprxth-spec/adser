import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      sheetId?: string | null;
      sheetName?: string | null;
      sheetGid?: number | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    sheetId?: string | null;
    sheetName?: string | null;
    sheetGid?: number | null;
  }
}
