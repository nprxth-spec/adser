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

export interface ActiveFile {
    file: File;
    index: number;
    stage: UploadStage;
}

const CONCURRENCY = 3;

type DashboardUploadContextValue = {
    queue: File[];
    currentIndex: number;
    results: ResultItem[];
    stage: UploadStage;
    showBatchComplete: boolean;
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
    cancelUpload: () => void;
    activeFiles: ActiveFile[];
    completedCount: number;
};

const DashboardUploadContext = createContext<DashboardUploadContextValue | null>(null);

/** Memoized so that when only upload context state changes, the current page does not re-render. */
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
    const [results, setResults] = useState<ResultItem[]>([]);
    const [stage, setStage] = useState<UploadStage>("idle");
    const [showBatchComplete, setShowBatchComplete] = useState(false);
    const [duplicateAlertFilename, setDuplicateAlertFilename] = useState<string | null>(null);
    // Map of fileIndex -> per-file stage (only for files currently being processed)
    const [fileStages, setFileStages] = useState<Map<number, UploadStage>>(new Map());
    const [completedCount, setCompletedCount] = useState(0);

    const dismissDuplicateAlert = useCallback(() => setDuplicateAlertFilename(null), []);

    const isProcessingRef = useRef(false);
    const isCancelledRef = useRef(false);
    const abortControllersRef = useRef<Map<number, AbortController>>(new Map());
    const deferredSessionUpdateRef = useRef(false);
    const sessionRef = useRef(session);
    sessionRef.current = session;

    // Worker coordination (refs to avoid stale closures)
    const nextIndexRef = useRef(0);
    const activeWorkerCountRef = useRef(0);
    const queueRef = useRef<File[]>([]);
    const resultsRef = useRef<ResultItem[]>([]);
    const completedCountRef = useRef(0);
    const totalFilesRef = useRef(0);

    const requestSessionUpdate = useCallback(async () => {
        if (isProcessingRef.current) {
            deferredSessionUpdateRef.current = true;
        } else {
            await update();
        }
    }, [update]);

    const cancelUpload = useCallback(() => {
        isCancelledRef.current = true;
        isProcessingRef.current = false;
        for (const [, ctrl] of abortControllersRef.current) ctrl.abort();
        abortControllersRef.current.clear();
        setStage("idle");
        setQueue([]);
        setFileStages(new Map());
        setCompletedCount(0);
        nextIndexRef.current = 0;
        activeWorkerCountRef.current = 0;
    }, []);

    const setFileStageById = useCallback((fileIndex: number, fileStage: UploadStage | null) => {
        setFileStages(prev => {
            const next = new Map(prev);
            if (fileStage === null) {
                next.delete(fileIndex);
            } else {
                next.set(fileIndex, fileStage);
            }
            return next;
        });
    }, []);

    const processFile = useCallback(
        async (file: File, fileIndex: number) => {
            if (isCancelledRef.current) return;

            setFileStageById(fileIndex, "uploading");

            const stageTimeouts: number[] = [];
            const ctrl = new AbortController();
            abortControllersRef.current.set(fileIndex, ctrl);

            try {
                const formData = new FormData();
                formData.append("file", file);
                const sheetId = (sessionRef.current?.user as { sheetId?: string })?.sheetId ?? "";
                if (sheetId) formData.append("sheetId", sheetId);

                stageTimeouts.push(window.setTimeout(() => setFileStageById(fileIndex, "extracting"), 800));
                stageTimeouts.push(window.setTimeout(() => setFileStageById(fileIndex, "drive"), 2500));
                stageTimeouts.push(window.setTimeout(() => setFileStageById(fileIndex, "sheets"), 4000));

                const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData,
                    signal: ctrl.signal,
                });
                const raw = await res.text();
                let data: any = null;
                try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

                if (!res.ok) {
                    if (res.status === 409) setDuplicateAlertFilename(file.name);
                    const useThai = language === "th";
                    const localizedError = useThai ? data?.errorTh : data?.errorEn;
                    const fallback = raw && raw.length < 200 ? raw : `Upload failed (${res.status})`;
                    throw new Error(localizedError ?? data?.error ?? fallback);
                }

                if (!data?.data) throw new Error("Upload response is not valid JSON data");

                const newResult = data.data as InvoiceResult;
                resultsRef.current = [...resultsRef.current, newResult];
                setResults([...resultsRef.current]);

            } catch (err: unknown) {
                if (isCancelledRef.current) return;
                const message = err instanceof Error ? err.message : "An unexpected error occurred";
                resultsRef.current = [...resultsRef.current, { filename: file.name, error: message }];
                setResults([...resultsRef.current]);
            } finally {
                for (const id of stageTimeouts) window.clearTimeout(id);
                abortControllersRef.current.delete(fileIndex);
                setFileStageById(fileIndex, null);
                completedCountRef.current += 1;
                setCompletedCount(completedCountRef.current);
            }
        },
        [language, setFileStageById]
    );

    // Worker loop — each worker processes files until the queue is exhausted
    const runWorker = useCallback(async () => {
        while (!isCancelledRef.current) {
            const idx = nextIndexRef.current;
            if (idx >= totalFilesRef.current) break;
            nextIndexRef.current = idx + 1;

            const file = queueRef.current[idx];
            if (!file) break;
            await processFile(file, idx);

            // Brief yield so React can flush state updates between files
            if (!isCancelledRef.current) await new Promise(r => setTimeout(r, 200));
        }

        activeWorkerCountRef.current -= 1;
        if (activeWorkerCountRef.current === 0 && !isCancelledRef.current) {
            isProcessingRef.current = false;
            setStage("done");
            setShowBatchComplete(true);
            if (deferredSessionUpdateRef.current) {
                deferredSessionUpdateRef.current = false;
                update().catch(() => {});
            }
        }
    }, [processFile, update]);

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            if (acceptedFiles.length === 0) return;
            isCancelledRef.current = false;
            isProcessingRef.current = true;
            setDuplicateAlertFilename(null);

            queueRef.current = acceptedFiles;
            resultsRef.current = [];
            completedCountRef.current = 0;
            nextIndexRef.current = 0;
            totalFilesRef.current = acceptedFiles.length;
            activeWorkerCountRef.current = 0;

            setQueue(acceptedFiles);
            setResults([]);
            setFileStages(new Map());
            setCompletedCount(0);
            setStage("uploading");

            const workerCount = Math.min(CONCURRENCY, acceptedFiles.length);
            activeWorkerCountRef.current = workerCount;
            for (let i = 0; i < workerCount; i++) {
                void runWorker();
            }
        },
        [runWorker]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "application/pdf": [".pdf"] },
        disabled: stage !== "idle" && stage !== "done" && stage !== "error",
    });

    const resetState = useCallback(() => {
        isCancelledRef.current = false;
        isProcessingRef.current = false;
        for (const [, ctrl] of abortControllersRef.current) ctrl.abort();
        abortControllersRef.current.clear();
        setDuplicateAlertFilename(null);
        setStage("idle");
        setResults([]);
        setQueue([]);
        setFileStages(new Map());
        setCompletedCount(0);
        nextIndexRef.current = 0;
        activeWorkerCountRef.current = 0;
    }, []);

    const acknowledgeBatchComplete = useCallback(() => {
        isCancelledRef.current = false;
        isProcessingRef.current = false;
        setShowBatchComplete(false);
        setStage("idle");
        setQueue([]);
        setFileStages(new Map());
        setCompletedCount(0);
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isProcessingRef.current) e.preventDefault();
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    const isProcessing = fileStages.size > 0 || (isProcessingRef.current);

    // Build sorted activeFiles array for UI consumption
    const activeFiles: ActiveFile[] = [];
    for (const [index, s] of fileStages) {
        const file = queueRef.current[index];
        if (file) activeFiles.push({ file, index, stage: s });
    }
    activeFiles.sort((a, b) => a.index - b.index);

    // Backward-compat single-file props
    const currentFile = activeFiles[0]?.file ?? null;
    const currentIndex = activeFiles[0]?.index ?? -1;

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
        cancelUpload,
        activeFiles,
        completedCount,
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
