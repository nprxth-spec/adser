"use client";

import {
    createContext,
    memo,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { useDropzone } from "react-dropzone";
import { useSession } from "next-auth/react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

export type UploadStage = "idle" | "uploading" | "extracting" | "drive" | "sheets" | "done" | "error";

export interface InvoiceResult {
    filename: string;
    date: string;
    card_last_4: string;
    amount: number;
    currency: string;
    driveLink: string;
    billed_to: string;
    paymentSuccess?: boolean;
}

type ResultItem = InvoiceResult | { filename: string; error: string };

type DashboardUploadContextValue = {
    queue: File[];
    currentIndex: number;
    results: ResultItem[];
    stage: UploadStage;
    showBatchComplete: boolean;
    /** Filename when last upload was rejected as duplicate; show alert until dismissed. */
    duplicateAlertFilename: string | null;
    dismissDuplicateAlert: () => void;
    onDrop: (acceptedFiles: File[]) => void;
    resetState: () => void;
    acknowledgeBatchComplete: () => void;
    getRootProps: () => object;
    getInputProps: () => object;
    isDragActive: boolean;
    requestSessionUpdate: () => Promise<void>;
    isProcessing: boolean;
    currentFile: File | null;
};

const DashboardUploadContext = createContext<DashboardUploadContextValue | null>(null);

/** Memoized so that when only upload context state changes, the current page does not re-render (avoids lag when navigating away during upload). */
const MemoizedMain = memo(function MemoizedMain({ children }: { children: React.ReactNode }) {
    return (
        <main className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 lg:p-5">
            {children}
        </main>
    );
});

export function DashboardUploadProvider({ children }: { children: React.ReactNode }) {
    const { data: session, update } = useSession();
    const { language } = useAppPreferences();

    const [queue, setQueue] = useState<File[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [results, setResults] = useState<ResultItem[]>([]);
    const [stage, setStage] = useState<UploadStage>("idle");
    const [showBatchComplete, setShowBatchComplete] = useState(false);
    const [duplicateAlertFilename, setDuplicateAlertFilename] = useState<string | null>(null);

    const dismissDuplicateAlert = useCallback(() => setDuplicateAlertFilename(null), []);

    const isProcessingRef = useRef(false);
    const deferredSessionUpdateRef = useRef(false);
    const sessionRef = useRef(session);
    sessionRef.current = session;

    const requestSessionUpdate = useCallback(async () => {
        if (isProcessingRef.current) {
            deferredSessionUpdateRef.current = true;
        } else {
            await update();
        }
    }, [update]);

    const processNext = useCallback(
        async (files: File[], index: number, currentResults: ResultItem[]) => {
            if (index >= files.length) {
                isProcessingRef.current = false;
                setCurrentIndex(-1);
                setStage("done");
                setShowBatchComplete(true);
                if (deferredSessionUpdateRef.current) {
                    deferredSessionUpdateRef.current = false;
                    update().catch(() => {});
                }
                return;
            }

            if (index === 0) {
                isProcessingRef.current = true;
            }

            const file = files[index];
            setCurrentIndex(index);
            setStage("uploading");

            try {
                const formData = new FormData();
                formData.append("file", file);
                const sheetId = (sessionRef.current?.user as { sheetId?: string })?.sheetId ?? "";
                if (sheetId) formData.append("sheetId", sheetId);

                setTimeout(() => setStage("extracting"), 800);
                setTimeout(() => setStage("drive"), 2500);
                setTimeout(() => setStage("sheets"), 4000);

                const res = await fetch("/api/upload", { method: "POST", body: formData });
                const raw = await res.text();
                let data: any = null;
                try {
                    data = raw ? JSON.parse(raw) : null;
                } catch {
                    data = null;
                }

                if (!res.ok) {
                    if (res.status === 409) {
                        setDuplicateAlertFilename(file.name);
                    }
                    const useThai = language === "th";
                    const localizedError = useThai ? data?.errorTh : data?.errorEn;
                    const fallback =
                        raw && raw.length < 200
                            ? raw
                            : `Upload failed (${res.status})`;
                    throw new Error(localizedError ?? data?.error ?? fallback);
                }

                if (!data?.data) {
                    throw new Error("Upload response is not valid JSON data");
                }

                const newResult = data.data as InvoiceResult;
                const updatedResults = [...currentResults, newResult];
                setResults(updatedResults);
                setTimeout(() => processNext(files, index + 1, updatedResults), 1000);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "An unexpected error occurred";
                const errorResult: ResultItem = { filename: file.name, error: message };
                const updatedResults = [...currentResults, errorResult];
                setResults(updatedResults);
                setTimeout(() => processNext(files, index + 1, updatedResults), 1000);
            }
        },
        [update]
    );

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            if (acceptedFiles.length > 0) {
                setDuplicateAlertFilename(null);
                setQueue(acceptedFiles);
                setResults([]);
                setCurrentIndex(-1);
                processNext(acceptedFiles, 0, []);
            }
        },
        [processNext]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "application/pdf": [".pdf"] },
        disabled: stage !== "idle" && stage !== "done" && stage !== "error",
    });

    const resetState = useCallback(() => {
        isProcessingRef.current = false;
        setDuplicateAlertFilename(null);
        setStage("idle");
        setResults([]);
        setQueue([]);
        setCurrentIndex(-1);
    }, []);

    const acknowledgeBatchComplete = useCallback(() => {
        isProcessingRef.current = false;
        setShowBatchComplete(false);
        setStage("idle");
        setQueue([]);
        setCurrentIndex(-1);
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isProcessingRef.current) e.preventDefault();
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    const isProcessing = currentIndex >= 0 && currentIndex < queue.length;
    const currentFile = isProcessing ? queue[currentIndex] : null;

    const value: DashboardUploadContextValue = {
        queue,
        currentIndex,
        results,
        stage,
        showBatchComplete,
        duplicateAlertFilename,
        dismissDuplicateAlert,
        onDrop,
        resetState,
        acknowledgeBatchComplete,
        getRootProps,
        getInputProps,
        isDragActive,
        requestSessionUpdate,
        isProcessing,
        currentFile,
    };

    return (
        <DashboardUploadContext.Provider value={value}>
            <MemoizedMain>{children}</MemoizedMain>
        </DashboardUploadContext.Provider>
    );
}

export function useDashboardUpload() {
    const ctx = useContext(DashboardUploadContext);
    if (!ctx) throw new Error("useDashboardUpload must be used within DashboardUploadProvider");
    return ctx;
}
