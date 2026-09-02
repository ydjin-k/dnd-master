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
  type Likelihood,
  emptyCampaignState,
} from "./types";

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
  startAdventure: () => Promise<void>;
  chooseOption: (optionId: string) => Promise<void>;
  submitCustomAction: (text: string) => Promise<void>;
  askOracle: (question: string, likelihood: Likelihood) => Promise<void>;
  adjustChaosFactor: (delta: number) => Promise<void>;
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

  const addJournalEntry = useCallback(
    async (entry: JournalEntry) => {
      await persist({ ...state, journal: [...state.journal, entry] });
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

  // Эти три действия сохраняют состояние уже на бэкенде (внутри Rust-команды),
  // поэтому здесь только применяем результат, не вызываем save_campaign повторно.
  const startAdventure = useCallback(async () => {
    try {
      setState(await invoke<CampaignState>("start_adventure"));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const chooseOption = useCallback(async (optionId: string) => {
    try {
      setState(await invoke<CampaignState>("choose_option", { optionId }));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const submitCustomAction = useCallback(async (text: string) => {
    try {
      setState(await invoke<CampaignState>("submit_custom_action", { text }));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Бой: тоже сохраняется на бэкенде внутри команды — тут только применяем
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

  const askOracle = useCallback(
    (question: string, likelihood: Likelihood) =>
      runServerAction("ask_oracle", { question, likelihood }),
    [runServerAction],
  );
  const adjustChaosFactor = useCallback(
    (delta: number) => runServerAction("adjust_chaos_factor", { delta }),
    [runServerAction],
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
        startAdventure,
        chooseOption,
        submitCustomAction,
        askOracle,
        adjustChaosFactor,
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
