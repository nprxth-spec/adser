import { Loader2 } from "lucide-react";

export default function PageLoader() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] w-full py-12">
      <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
    </div>
  );
}
