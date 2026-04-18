"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Pessoa } from "@/lib/types";

interface PinGateProps {
  title?: string;
  subtitle?: string;
  onSuccess: (pessoa: Pessoa) => void;
  onValidate: (pin: string) => Promise<Pessoa | null>;
  onCancel?: () => void;
  cancelLabel?: string;
}

export function PinGate({
  title = "Identifica-te",
  subtitle = "Introduz o teu PIN para aceder",
  onSuccess,
  onValidate,
  onCancel,
  cancelLabel = "Cancelar",
}: PinGateProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  function press(digit: string) {
    if (pin.length >= 6) return;
    setPin((prev) => prev + digit);
    setError(null);
  }

  function backspace() {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }

  function clear() {
    setPin("");
    setError(null);
  }

  async function confirm() {
    if (pin.length < 4) {
      setError("PIN demasiado curto");
      return;
    }
    setChecking(true);
    const pessoa = await onValidate(pin);
    setChecking(false);
    if (pessoa) {
      onSuccess(pessoa);
    } else {
      setError("PIN inválido");
      setPin("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">{subtitle}</p>
        </div>

        {/* Display */}
        <div className="mt-5 rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
          <div className="flex justify-center gap-2">
            {Array.from({ length: Math.max(6, pin.length) }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "h-4 w-4 rounded-full transition-all",
                  i < pin.length ? "bg-emerald-500 scale-110" : "bg-slate-200"
                )}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-center text-sm font-extrabold text-red-600">{error}</p>
        )}

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
          {onCancel ? (
            <button
              onClick={onCancel}
              className="rounded-2xl bg-slate-200 py-3.5 text-base font-extrabold text-slate-700 transition-all hover:bg-slate-300 active:scale-95"
            >
              {cancelLabel}
            </button>
          ) : <div />}
          <button
            onClick={confirm}
            disabled={checking || pin.length < 4}
            className="rounded-2xl bg-emerald-600 py-3.5 text-base font-extrabold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
          >
            {checking ? "A verificar..." : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumBtn({ children, onClick, variant = "num" }: { children: React.ReactNode; onClick: () => void; variant?: "num" | "clear" | "back" }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-14 items-center justify-center rounded-2xl text-2xl font-black shadow-sm transition-all active:scale-95",
        variant === "num" && "bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50",
        variant === "clear" && "bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100",
        variant === "back" && "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
      )}
    >
      {children}
    </button>
  );
}
