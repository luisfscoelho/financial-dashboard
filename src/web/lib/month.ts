import { createContext, useContext } from "react";
import { currentMonth } from "../../shared/months";

/** Mês selecionado, compartilhado entre Visão geral, Transações e Orçamentos. */
export const MonthContext = createContext<[string, (m: string) => void]>([currentMonth(), () => {}]);
export const useMonth = () => useContext(MonthContext);
