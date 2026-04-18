"use client";

import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  title: string;
  message?: string;
  detail?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  detail,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="text-center">
          <div className={cn(
            "mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-3xl",
            variant === "danger" ? "bg-red-100 text-red-600" :
            variant === "warning" ? "bg-yellow-100 text-yellow-600" :
            "bg-blue-100 text-blue-600"
          )}>
            {variant === "danger" ? "⚠" : variant === "warning" ? "!" : "?"}
          </div>
          <h2 className="text-2xl font-black text-slate-900">{title}</h2>
          {message && <p className="mt-1 text-sm font-bold text-slate-500">{message}</p>}
        </div>
        {detail && <div className="mt-4">{detail}</div>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="rounded-2xl bg-slate-200 py-3.5 text-base font-extrabold text-slate-700 transition-all hover:bg-slate-300 active:scale-95"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "rounded-2xl py-3.5 text-base font-extrabold text-white shadow-md transition-all active:scale-95",
              variant === "danger" ? "bg-red-600 hover:bg-red-700" :
              variant === "warning" ? "bg-yellow-500 hover:bg-yellow-600" :
              "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
