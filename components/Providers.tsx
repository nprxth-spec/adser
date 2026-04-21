"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useRef, useEffect } from "react";
import { AppPreferencesProvider } from "@/components/AppPreferencesProvider";

function LogLoginOnMount() {
    const { data: session, status } = useSession();
    const logged = useRef(false);

    useEffect(() => {
        if (status !== "authenticated" || !session?.user?.id || logged.current) return;
        logged.current = true;
        fetch("/api/auth/log-login", { method: "POST" }).catch(() => {});
    }, [session?.user?.id, status]);

    return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <AppPreferencesProvider>
                <LogLoginOnMount />
                {children}
            </AppPreferencesProvider>
        </SessionProvider>
    );
}
