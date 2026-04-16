import { cn } from "@/lib/utils";

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClass?: string;
}

/** Small "Label: value" line used inside cards. */
export function InfoRow({ label, value, className, valueClass }: InfoRowProps) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={cn("flex items-baseline gap-1 text-[11px] leading-tight", className)}>
      <span className="shrink-0 font-bold text-slate-500">{label}:</span>
      <span className={cn("truncate font-bold text-slate-900", valueClass)}>{value}</span>
    </div>
  );
}
