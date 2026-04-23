"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useFuncionarioSession } from "@/hooks/use-pessoa-session";

interface FuncionarioAuthGateProps {
  children: React.ReactNode;
  requiredAccess: string;
  title: string;
  subtitle?: string;
}

export function FuncionarioAuthGate({ children, requiredAccess, title, subtitle }: FuncionarioAuthGateProps) {
  const { session, loaded, login, logout } = useFuncionarioSession();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loaded && !session) inputRef.current?.focus();
  }, [loaded, session]);

  // Antes de hidratar, não renderizar nada (evita flash de conteúdo protegido)
  if (!loaded) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
      </div>
    );
  }

  const hasAccess = session && session.acessos.includes(requiredAccess);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || loading) return;
    setLoading(true);
    setError(null);
    const result = await login(pin, requiredAccess);
    setLoading(false);
    if (!result.ok) {
      if (result.reason === "invalid_pin") setError("PIN inválido");
      else setError("Sem acesso a esta área");
      setPin("");
      inputRef.current?.focus();
      return;
    }
    setPin("");
  };

  if (!session || !hasAccess) {
    const loggedInButNoAccess = !!session && !hasAccess;
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
        <div className="absolute left-4 top-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Voltar ao menu
          </Link>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-lg">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0h-2m9-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-center text-2xl font-black text-slate-900">{title}</h1>
            <p className="text-center text-xs font-bold text-slate-500">
              {subtitle ?? "Introduz o teu PIN para entrar"}
            </p>
          </div>

          {loggedInButNoAccess && session && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-xs font-bold text-amber-800">
              <p>Olá <span className="font-black">{session.nome}</span> — não tens acesso a <span className="font-black">{title}</span>.</p>
              <p className="mt-1 font-normal">Entra com outro PIN ou volta ao menu.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
                  setError(null);
                }}
                placeholder="••••"
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center text-3xl font-black tracking-[0.5em] text-slate-900 outline-none transition-all focus:border-slate-900 focus:bg-white"
                maxLength={8}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-bold text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!pin || loading}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "A verificar…" : "Entrar"}
            </button>
          </form>

          {session && !hasAccess && (
            <button
              onClick={() => {
                logout();
                setError(null);
              }}
              className="mt-3 w-full rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Trocar de utilizador ({session.nome})
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <FuncionarioSessionPill nome={session.nome} onLogout={logout} />
    </>
  );
}

function FuncionarioSessionPill({ nome, onLogout }: { nome: string; onLogout: () => void }) {
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="group fixed bottom-4 right-4 z-40">
      <div className="flex items-center rounded-full border border-slate-200 bg-white shadow-md transition-all">
        <span className="flex max-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap pl-0 text-[11px] font-bold text-slate-600 transition-all group-hover:max-w-[200px] group-hover:pl-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>{nome}</span>
        </span>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-700"
          title={`Sessão: ${nome}`}
        >
          {iniciais || "?"}
        </span>
        <button
          onClick={onLogout}
          className="hidden shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-red-100 hover:text-red-600 group-hover:ml-0.5 group-hover:mr-0.5 group-hover:block"
          title="Terminar sessão"
          aria-label="Sair"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
