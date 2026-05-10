import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      credits?: number;
      plan?: string;
      sheetId?: string | null;
      sheetName?: string | null;
      sheetGid?: number | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    credits?: number;
    plan?: string;
    sheetId?: string | null;
    sheetName?: string | null;
    sheetGid?: number | null;
  }
}
