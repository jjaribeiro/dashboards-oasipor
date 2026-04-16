"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ColumnProps {
  title: string;
  icon: string;
  count: number;
  accentClass: string;
  onAdd: () => void;
  children: React.ReactNode;
  kiosk?: boolean;
}

export function Column({
  title,
  icon,
  count,
  accentClass,
  onAdd,
  children,
  kiosk,
}: ColumnProps) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className={cn(
          "flex items-center justify-between border-b border-slate-200 px-4 py-3"
        )}
      >
        <div className="flex items-center gap-2">
          <span className={kiosk ? "text-2xl" : "text-lg"}>{icon}</span>
          <h2
            className={cn(
              "font-bold text-slate-800",
              kiosk ? "text-lg" : "text-sm"
            )}
          >
            {title}
          </h2>
          <span
            className={cn(
              "flex items-center justify-center rounded-full font-bold",
              kiosk
                ? "h-9 min-w-9 px-2 text-lg"
                : "h-6 min-w-6 px-1.5 text-xs",
              accentClass
            )}
          >
            {count}
          </span>
        </div>
        {!kiosk && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-900"
            onClick={onAdd}
          >
            +
          </Button>
        )}
      </div>
      <div className="grid flex-1 auto-rows-fr grid-rows-4 gap-2 overflow-hidden p-2">
        {children}
      </div>
    </div>
  );
}
