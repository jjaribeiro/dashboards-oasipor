"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface NumpadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label?: string;
  currentValue: number;
  target?: number;
  onConfirm: (value: number) => void;
}

export function Numpad({ open, onOpenChange, label = "Quantidade", currentValue, target, onConfirm }: NumpadProps) {
  const [value, setValue] = useState<string>("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const displayValue = value === "" ? currentValue.toString() : value;

  function press(digit: string) {
    setValue((prev) => {
      const next = (prev === "" ? "" : prev) + digit;
      // Limitar a 6 dígitos
      if (next.length > 6) return prev;
      // Remover zero à esquerda
      return next.replace(/^0+(\d)/, "$1");
    });
  }

  function backspace() {
    setValue((prev) => {
      if (prev === "") return (currentValue.toString().slice(0, -1)) || "";
      return prev.slice(0, -1);
    });
  }

  function clear() {
    setValue("0");
  }

  function confirm() {
    const n = value === "" ? currentValue : Number(value);
    if (isFinite(n) && n >= 0) {
      onConfirm(n);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200 bg-white p-6 text-slate-900 sm:max-w-md">
        {/* Label */}
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</p>

        {/* Display */}
        <div className="mt-2 rounded-2xl border-2 border-slate-200 bg-slate-50 p-6">
          <p className="text-center text-7xl font-black leading-none text-slate-900">{displayValue}</p>
          {target !== undefined && (
            <p className="mt-2 text-center text-sm font-bold text-slate-500">
              de <span className="text-slate-900">{target}</span> un
            </p>
          )}
        </div>

        {/* Numpad */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <NumBtn key={n} onClick={() => press(n.toString())}>{n}</NumBtn>
          ))}
          <NumBtn onClick={clear} variant="clear">C</NumBtn>
          <NumBtn onClick={() => press("0")}>0</NumBtn>
          <NumBtn onClick={backspace} variant="back">⌫</NumBtn>
        </div>

        {/* Actions */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-2xl bg-slate-200 py-4 text-lg font-extrabold text-slate-700 shadow-sm transition-all hover:bg-slate-300 active:scale-95"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            className="rounded-2xl bg-emerald-600 py-4 text-lg font-extrabold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95"
          >
            ✓ Guardar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NumBtn({ children, onClick, variant = "num" }: { children: React.ReactNode; onClick: () => void; variant?: "num" | "clear" | "back" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-16 items-center justify-center rounded-2xl text-3xl font-black shadow-sm transition-all active:scale-95",
        variant === "num" && "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50",
        variant === "clear" && "bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100",
        variant === "back" && "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
      )}
    >
      {children}
    </button>
  );
}
