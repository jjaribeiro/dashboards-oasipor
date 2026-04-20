import Link from "next/link";
import { ClockDisplay } from "@/components/clock-display";

export const dynamic = "force-static";

const TILES = [
  {
    href: "/producao/planeamento",
    title: "Produção — Planeamento",
    subtitle: "Pedidos · Ordens · Planeamento Produção",
    icon: "📅",
    accent: "from-purple-500 to-fuchsia-600",
    ring: "ring-purple-200",
  },
  {
    href: "/producao/gestao",
    title: "Produção — Gestão",
    subtitle: "Panorâmica de todas as zonas fabris em tempo real",
    icon: "🏭",
    accent: "from-amber-500 to-orange-600",
    ring: "ring-amber-200",
  },
  {
    href: "/producao/operador",
    title: "Produção — Operadores",
    subtitle: "Vista operacional por sala / linha / equipamento",
    icon: "👷",
    accent: "from-emerald-500 to-teal-600",
    ring: "ring-emerald-200",
  },
  {
    href: "/producao/kpis",
    title: "Produção — KPIs",
    subtitle: "Indicadores agregados de produção, fluxo e pessoas",
    icon: "📊",
    accent: "from-sky-500 to-cyan-600",
    ring: "ring-sky-200",
  },
  {
    href: "/producao/qualidade",
    title: "Dashboard Qualidade",
    subtitle: "Planeamento, Rótulos, CQ",
    icon: "🔬",
    accent: "from-lime-500 to-emerald-600",
    ring: "ring-lime-200",
  },
  {
    href: "/producao/dados",
    title: "Funcionários",
    subtitle: "Gestão de equipa, PINs e acessos",
    icon: "👥",
    accent: "from-slate-500 to-slate-800",
    ring: "ring-slate-200",
  },
];

export default function Hub() {
  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-oasipor.png" alt="Oasipor" className="h-14" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Dashboards Oasipor</h1>
            <p className="text-sm font-semibold text-slate-500">Centro de operações</p>
          </div>
        </div>
        <ClockDisplay />
      </header>

      <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
          {TILES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-transparent transition-all hover:-translate-y-1 hover:shadow-2xl hover:${t.ring}`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.accent}`} />
              <div className="text-6xl">{t.icon}</div>
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">{t.title}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{t.subtitle}</p>
              </div>
              <div className="flex items-center gap-1 text-sm font-bold text-slate-400 transition-colors group-hover:text-slate-900">
                Abrir
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
