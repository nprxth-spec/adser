import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LandingPage from "@/components/LandingPage";
import { isMaintenanceModeEnabled } from "@/lib/maintenance";

export default async function Page() {
  if (isMaintenanceModeEnabled()) {
    redirect("/maintenance");
  }

  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}

