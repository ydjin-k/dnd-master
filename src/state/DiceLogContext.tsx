import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { RollResult } from "./types";

/**
 * Сколько последних записей держит журнал бросков. Единственный владелец числа:
 * страница кубиков его не знает и срез не делает.
 */
const LOG_LIMIT = 10;

/** Запись журнала: бросок движка, его ошибка либо результат, введённый вручную. */
export interface DiceLogItem {
  id: string;
  label: string;
  result?: RollResult;
  error?: string;
  manual?: number;
}

interface DiceLogContextValue {
  /** Новые записи впереди, не длиннее LOG_LIMIT. */
  log: DiceLogItem[];
  recordRoll: (label: string, result: RollResult) => void;
  recordRollError: (label: string, error: string) => void;
  recordManual: (label: string, value: number) => void;
  clearLog: () => void;
}

const DiceLogContext = createContext<DiceLogContextValue | null>(null);

/**
 * Владеет журналом бросков. Монтируется в App.tsx ВНУТРИ CampaignProvider, но
 * НАД AppShell: уход с «Кубиков» на другую вкладку размонтирует страницу и не
 * должен стирать историю — чистит её только кнопка «Очистить историю»; а вот
 * вход в другую кампанию пересоздаёт CampaignProvider вместе с этим провайдером,
 * поэтому броски одного стола не всплывают за другим. На диск журнал не
 * сохраняется: живёт, пока открыто приложение.
 */
export function DiceLogProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<DiceLogItem[]>([]);

  const prepend = useCallback((entry: Omit<DiceLogItem, "id">) => {
    setLog((prev) => [{ id: crypto.randomUUID(), ...entry }, ...prev].slice(0, LOG_LIMIT));
  }, []);

  const recordRoll = useCallback(
    (label: string, result: RollResult) => prepend({ label, result }),
    [prepend],
  );

  const recordRollError = useCallback(
    (label: string, error: string) => prepend({ label, error }),
    [prepend],
  );

  const recordManual = useCallback(
    (label: string, value: number) => prepend({ label, manual: value }),
    [prepend],
  );

  const clearLog = useCallback(() => setLog([]), []);

  return (
    <DiceLogContext.Provider value={{ log, recordRoll, recordRollError, recordManual, clearLog }}>
      {children}
    </DiceLogContext.Provider>
  );
}

export function useDiceLog(): DiceLogContextValue {
  const ctx = useContext(DiceLogContext);
  if (!ctx) throw new Error("useDiceLog вызван вне DiceLogProvider");
  return ctx;
}
