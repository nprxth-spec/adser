import { auth } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardUploadProvider } from "@/components/DashboardUploadContext";
import GoogleReauthDialog from "@/components/GoogleReauthDialog";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const user = session?.user;
    const credits = (user as any)?.credits ?? 0;
    const plan = (user as any)?.plan ?? "free";

    return (
        <div className="flex min-h-screen bg-slate-50">
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <DashboardHeader user={user} credits={credits} plan={plan} />
                <GoogleReauthDialog />

                {/* Upload state lives in provider so it survives navigation; MemoizedMain avoids re-rendering other pages while upload state updates */}
                <DashboardUploadProvider>
                    {children}
                </DashboardUploadProvider>
            </div>
        </div>
    );
}
