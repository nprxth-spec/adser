import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    return (
        <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <DashboardHeader user={user} />
                <GoogleReauthDialog />
                <DashboardUploadProvider>
                    {children}
                </DashboardUploadProvider>
            </div>
        </div>
    );
}
