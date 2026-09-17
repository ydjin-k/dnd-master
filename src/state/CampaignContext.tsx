import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  type CampaignState,
  type Character,
  type JournalEntry,
  emptyCampaignState,
} from "./types";
import { JOURNAL_ENTRY_MAX_LENGTH, clampToLength } from "../ui/journalEntryText";

interface CampaignContextValue {
  state: CampaignState;
  loading: boolean;
  error: string | null;
  addCharacter: (character: Character) => Promise<void>;
  removeCharacter: (id: string) => Promise<void>;
  updateCharacter: (id: string, updater: (character: Character) => Character) => Promise<void>;
  addJournalEntry: (entry: JournalEntry) => Promise<void>;
  removeJournalEntry: (id: string) => Promise<void>;
  setCampaignName: (name: string) => Promise<void>;
  startCombat: (monsterIds: string[], characterIds: string[]) => Promise<void>;
  moveCombatant: (combatantId: string, x: number, y: number) => Promise<void>;
  combatAttack: (attackerId: string, targetId: string) => Promise<void>;
  combatCastSpell: (casterId: string, spellId: string, targetId: string | null) => Promise<void>;
  applyDamage: (targetId: string, delta: number) => Promise<void>;
  endTurn: () => Promise<void>;
  monsterAutoTurn: () => Promise<void>;
  endCombat: () => Promise<void>;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CampaignState>(emptyCampaignState());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<CampaignState | null>("load_active_campaign")
      .then((loaded) => {
        if (loaded) setState(loaded);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(async (next: CampaignState) => {
    setState(next);
    try {
      await invoke("save_campaign", { state: next });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const addCharacter = useCallback(
    async (character: Character) => {
      await persist({ ...state, characters: [...state.characters, character] });
    },
    [state, persist],
  );

  const removeCharacter = useCallback(
    async (id: string) => {
      await persist({ ...state, characters: state.characters.filter((c) => c.id !== id) });
    },
    [state, persist],
  );

  const updateCharacter = useCallback(
    async (id: string, updater: (character: Character) => Character) => {
      await persist({
        ...state,
        characters: state.characters.map((c) => (c.id === id ? updater(c) : c)),
      });
    },
    [state, persist],
  );

  /**
   * Предел длины проверяется ЗДЕСЬ, а не в форме дневника.
   *
   * Раньше он жил атрибутом `maxLength` у поля ввода на «Дневнике», то есть
   * был свойством одной формы. Кнопка «В дневник» на «Приключениях» пишет
   * мимо этой формы и предела не видела — в кампанию уезжали записи до 3043
   * символов при пределе 100, а стили их молча обрезали. Теперь правило
   * принадлежит данным: кто бы ни писал, длина одна и та же.
   */
  const addJournalEntry = useCallback(
    async (entry: JournalEntry) => {
      const text = clampToLength(entry.text, JOURNAL_ENTRY_MAX_LENGTH);
      await persist({ ...state, journal: [...state.journal, { ...entry, text }] });
    },
    [state, persist],
  );

  const removeJournalEntry = useCallback(
    async (id: string) => {
      await persist({ ...state, journal: state.journal.filter((entry) => entry.id !== id) });
    },
    [state, persist],
  );

  const setCampaignName = useCallback(
    async (name: string) => {
      await persist({ ...state, campaignName: name });
    },
    [state, persist],
  );

  // Бой сохраняется на бэкенде внутри команды — тут только применяем
  // результат. Общий враппер вместо семи одинаковых try/catch.
  const runServerAction = useCallback(
    async (command: string, args?: Record<string, unknown>) => {
      try {
        setState(await invoke<CampaignState>(command, args));
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const startCombat = useCallback(
    (monsterIds: string[], characterIds: string[]) =>
      runServerAction("start_combat", { monsterIds, characterIds }),
    [runServerAction],
  );
  const moveCombatant = useCallback(
    (combatantId: string, x: number, y: number) =>
      runServerAction("move_combatant", { combatantId, x, y }),
    [runServerAction],
  );
  const combatAttack = useCallback(
    (attackerId: string, targetId: string) =>
      runServerAction("combat_attack", { attackerId, targetId }),
    [runServerAction],
  );
  const combatCastSpell = useCallback(
    (casterId: string, spellId: string, targetId: string | null) =>
      runServerAction("combat_cast_spell", { casterId, spellId, targetId }),
    [runServerAction],
  );
  const applyDamage = useCallback(
    (targetId: string, delta: number) => runServerAction("apply_damage", { targetId, delta }),
    [runServerAction],
  );
  const endTurn = useCallback(() => runServerAction("end_turn"), [runServerAction]);
  const monsterAutoTurn = useCallback(
    () => runServerAction("monster_auto_turn"),
    [runServerAction],
  );
  const endCombat = useCallback(() => runServerAction("end_combat"), [runServerAction]);

  return (
    <CampaignContext.Provider
      value={{
        state,
        loading,
        error,
        addCharacter,
        removeCharacter,
        updateCharacter,
        addJournalEntry,
        removeJournalEntry,
        setCampaignName,
        startCombat,
        moveCombatant,
        combatAttack,
        combatCastSpell,
        applyDamage,
        endTurn,
        monsterAutoTurn,
        endCombat,
      }}
    >
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign(): CampaignContextValue {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error("useCampaign вызван вне CampaignProvider");
  return ctx;
}
