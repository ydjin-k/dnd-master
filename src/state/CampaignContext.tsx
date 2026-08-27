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

interface CampaignContextValue {
  state: CampaignState;
  loading: boolean;
  error: string | null;
  addCharacter: (character: Character) => Promise<void>;
  addJournalEntry: (entry: JournalEntry) => Promise<void>;
  setCampaignName: (name: string) => Promise<void>;
  startAdventure: () => Promise<void>;
  chooseOption: (optionId: string) => Promise<void>;
  submitCustomAction: (text: string) => Promise<void>;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CampaignState>(emptyCampaignState());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<CampaignState>("load_campaign")
      .then(setState)
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

  const addJournalEntry = useCallback(
    async (entry: JournalEntry) => {
      await persist({ ...state, journal: [...state.journal, entry] });
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

  return (
    <CampaignContext.Provider
      value={{
        state,
        loading,
        error,
        addCharacter,
        addJournalEntry,
        setCampaignName,
        startAdventure,
        chooseOption,
        submitCustomAction,
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
