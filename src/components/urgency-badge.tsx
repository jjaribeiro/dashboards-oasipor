import { cn } from "@/lib/utils";
import {
  getUrgencyLevel,
  getUrgencyBadgeColor,
  formatDeadline,
} from "@/lib/utils";

interface UrgencyBadgeProps {
  date: string | null;
  className?: string;
}

export function UrgencyBadge({ date, className }: UrgencyBadgeProps) {
  const level = getUrgencyLevel(date);
  const color = getUrgencyBadgeColor(level);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        color,
        className
      )}
    >
      {formatDeadline(date)}
    </span>
  );
}
