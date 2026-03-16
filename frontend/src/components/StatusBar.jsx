import useStore from "@/store/useStore";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export default function StatusBar() {
  const status = useStore((s) => s.status);

  if (!status.text) return null;

  const styles = {
    success: "bg-green-50 text-green-800 border-green-200",
    error: "bg-red-50 text-red-800 border-red-200",
    muted: "bg-muted text-muted-foreground border-border",
  };

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
    error: <AlertCircle className="h-4 w-4 shrink-0" />,
    muted: <Info className="h-4 w-4 shrink-0" />,
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-4 py-2 text-sm",
        styles[status.type] || styles.muted
      )}
      role="status"
      aria-live="polite"
    >
      {icons[status.type] || icons.muted}
      <span>{status.text}</span>
    </div>
  );
}
