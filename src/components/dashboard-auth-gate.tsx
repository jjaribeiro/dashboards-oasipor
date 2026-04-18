"use client";

import { usePessoaSession, logAction } from "@/hooks/use-pessoa-session";
import { PinGate } from "@/components/pin-gate";

interface DashboardAuthGateProps {
  children: React.ReactNode;
  dashboardKey: string; // ex: "comercial", "gestao", "operador"
  title: string;
  subtitle?: string;
  hideBadge?: boolean; // se true, não renderiza o badge flutuante (a página renderiza o seu inline)
}

export function DashboardAuthGate({ children, dashboardKey, title, subtitle, hideBadge }: DashboardAuthGateProps) {
  const { session, loaded, login, logout } = usePessoaSession();

  if (!loaded) {
    return <div className="flex h-full items-center justify-center text-slate-400">A carregar…</div>;
  }

  if (!session) {
    return (
      <PinGate
        title={title}
        subtitle={subtitle ?? "Introduz o teu PIN para entrar"}
        onValidate={login}
        onSuccess={(pessoa) => {
          logAction({
            pessoaId: pessoa.id,
            pessoaNome: pessoa.nome,
            acao: `login_${dashboardKey}`,
          });
        }}
      />
    );
  }

  return (
    <>
      {children}
      {!hideBadge && (
        <SessionBadge
          variant="floating"
          nome={session.pessoaNome}
          onLogout={() => {
            logAction({
              pessoaId: session.pessoaId,
              pessoaNome: session.pessoaNome,
              acao: `logout_${dashboardKey}`,
            });
            logout();
          }}
        />
      )}
    </>
  );
}

interface SessionBadgeProps {
  nome: string;
  onLogout: () => void;
  variant?: "floating" | "inline";
}

export function SessionBadge({ nome, onLogout, variant = "floating" }: SessionBadgeProps) {
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const wrapperCls = variant === "floating"
    ? "group fixed bottom-4 right-4 z-40"
    : "group relative inline-block";

  return (
    <div className={wrapperCls}>
      <div className="flex items-center rounded-full border border-slate-200 bg-white shadow-md transition-all">
        {/* Nome — colapsa por completo quando não hover */}
        <span className="flex max-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap pl-0 text-[11px] font-bold text-slate-600 transition-all group-hover:max-w-[200px] group-hover:pl-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>{nome}</span>
        </span>
        {/* Iniciais sempre visíveis */}
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-700"
          title={`Sessão: ${nome}`}
        >
          {iniciais || "?"}
        </span>
        {/* Botão Sair só no hover */}
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
