import { useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { currentMonth } from "../shared/months";
import { MonthContext } from "./lib/month";
import { Categorias } from "./pages/Categorias";
import { Contas } from "./pages/Contas";
import { Dashboard } from "./pages/Dashboard";
import { Orcamentos } from "./pages/Orcamentos";
import { Transacoes } from "./pages/Transacoes";

const NAV = [
  { to: "/", label: "Visão geral", icon: "◧" },
  { to: "/transacoes", label: "Transações", icon: "⇄" },
  { to: "/contas", label: "Contas", icon: "▤" },
  { to: "/orcamentos", label: "Orçamentos", icon: "◔" },
  { to: "/categorias", label: "Categorias", icon: "◈" },
];

export function App() {
  const month = useState(currentMonth());
  return (
    <MonthContext.Provider value={month}>
      <BrowserRouter>
        <div className="min-h-screen md:flex">
          <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 md:h-screen md:w-56 md:shrink-0 md:flex-col md:border-r md:border-b-0 md:px-3 md:py-5">
            <div className="hidden px-3 pb-5 text-base font-semibold md:block">💰 Finanças</div>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
                    isActive ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2"
                  }`
                }
              >
                <span aria-hidden className="w-4 text-center text-muted">
                  {n.icon}
                </span>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transacoes" element={<Transacoes />} />
              <Route path="/contas" element={<Contas />} />
              <Route path="/orcamentos" element={<Orcamentos />} />
              <Route path="/categorias" element={<Categorias />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </MonthContext.Provider>
  );
}
