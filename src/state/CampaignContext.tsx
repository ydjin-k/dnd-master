import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  type CampaignState,
  type Character,
  type GmResponse,
  type JournalEntry,
  type ResultObject,
  type SceneOutcome,
  emptyCampaignState,
} from "./types";
import { JOURNAL_ENTRY_MAX_LENGTH, appendedText, clampToLength } from "../ui/journalEntryText";

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
  gmCreateScene: (
    location: string,
    objective: string,
    participants: string[],
    tags: string[],
  ) => Promise<ResultObject | null>;
  gmEndScene: (outcome: SceneOutcome) => Promise<ResultObject | null>;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CampaignState>(emptyCampaignState());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Свежее состояние для тех, кто не может ждать перерисовки.
   *
   * `state` из `useState` виден вызывающему только с того рендера, в котором
   * он захвачен, а `setState` с функцией выполняется не сразу — React вправе
   * отложить обновление. Поэтому «прочитать актуальное прямо сейчас» через
   * него нельзя, и первая моя попытка сделать это функциональным обновлением
   * просто не сохраняла ничего: проба `persists the journal without the
   * removed entry` это и поймала.
   *
   * Ссылка обновляется в ОДНОМ месте — `commit` ниже, — поэтому разъехаться
   * с `state` ей негде.
   */
  const latest = useRef<CampaignState>(state);

  const commit = useCallback((next: CampaignState) => {
    latest.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    invoke<CampaignState | null>("load_active_campaign")
      .then((loaded) => {
        if (loaded) commit(loaded);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [commit]);

  const persist = useCallback(async (next: CampaignState) => {
    commit(next);
    try {
      await invoke("save_campaign", { state: next });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [commit]);

  /**
   * Сохранение, которое считает новое состояние ОТ СВЕЖЕГО, а не от снимка.
   *
   * Обычный `persist` принимает готовый объект, а мутаторы собирают его из
   * `state`, захваченного в замыкании своего рендера. Две записи подряд,
   * сделанные до перерисовки, исходят из одного снимка — и вторая затирает
   * первую вместе со всем, что появилось между ними. Для дневника это прямой
   * путь потерять записи, а с дописыванием в страницу ещё и текст: слияние
   * считалось бы от старого содержимого листа.
   *
   * Здесь новое состояние считается от `latest.current` — от того, что лежит
   * в кампании прямо сейчас, а не от снимка рендера.
   *
   * Остальные мутаторы пока ходят через `persist` со снимком — та же
   * опасность есть и у них, но переводить их скопом мимо этой задачи было бы
   * шире её объёма; заведено отдельной карточкой.
   */
  const persistWith = useCallback(
    async (update: (current: CampaignState) => CampaignState) => {
      const next = update(latest.current);
      commit(next);
      try {
        await invoke("save_campaign", { state: next });
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    },
    [commit],
  );

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

  /**
   * Через `persistWith`, а не `persist`: лист персонажа пишет в одного и того
   * же героя двумя путями — кнопкой состояния и «Безумие +1», — и обе записи
   * ложатся до перерисовки. Со снимком рендера вторая затирала первую вместе с
   * состоянием, добавленным между ними: наложенное безумие сносило с листа
   * «Ослеплённое». Остальные мутаторы по-прежнему ходят со снимком — их перевод
   * остаётся за своей карточкой, здесь переведён только этот.
   */
  const updateCharacter = useCallback(
    async (id: string, updater: (character: Character) => Character) => {
      await persistWith((current) => ({
        ...current,
        characters: current.characters.map((c) => (c.id === id ? updater(c) : c)),
      }));
    },
    [persistWith],
  );

  /**
   * Пометка ДОПИСЫВАЕТСЯ в текущую страницу, пока на ней есть место, и только
   * потом начинает новую. Страница дневника — лист, а не ячейка на одну
   * запись: владелец 17.09.2026 — «я сделал пометку на 100, потом хочу ещё
   * дописать в этот же блок, но получается мне уже нужно заводить новый».
   *
   * Предел проверяется ЗДЕСЬ, а не в форме дневника. Раньше он жил атрибутом
   * `maxLength` у поля ввода, то есть был свойством одной формы; кнопка
   * «В дневник» на «Приключениях» пишет мимо неё и предела не видела — в
   * кампанию уезжали записи до 3043 символов при пределе 100, а стили их
   * молча обрезали. Теперь правило принадлежит данным: кто бы ни писал —
   * форма, генератор событий или что появится дальше, — страница набирается
   * одинаково.
   *
   * Дописываем в САМУЮ СВЕЖУЮ страницу, а не в последнюю по порядку массива:
   * дневник показывает записи по времени, и «текущая» для игрока — верхняя.
   */
  const addJournalEntry = useCallback(
    async (entry: JournalEntry) => {
      await persistWith((current) => {
        const note = clampToLength(entry.text, JOURNAL_ENTRY_MAX_LENGTH);
        const newest = current.journal.reduce<JournalEntry | null>(
          (best, candidate) =>
            best === null || candidate.timestamp.localeCompare(best.timestamp) > 0
              ? candidate
              : best,
          null,
        );
        const merged = newest === null ? null : appendedText(newest.text, note);

        if (newest !== null && merged !== null) {
          return {
            ...current,
            journal: current.journal.map((item) =>
              item.id === newest.id ? { ...item, text: merged } : item,
            ),
          };
        }

        return { ...current, journal: [...current.journal, { ...entry, text: note }] };
      });
    },
    [persistWith],
  );

  const removeJournalEntry = useCallback(
    async (id: string) => {
      await persistWith((current) => ({
        ...current,
        journal: current.journal.filter((entry) => entry.id !== id),
      }));
    },
    [persistWith],
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
        // Через `commit`, а не `setState`: иначе `latest` протухнет после
        // любого хода боя, и следующая запись в дневник посчиталась бы от
        // состояния до боя.
        commit(await invoke<CampaignState>(command, args));
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    },
    [commit],
  );

  /**
   * Команда движка: намерение уезжает аргументами, состояние приезжает в
   * ответе и кладётся существующим `commit`. Фронт не вычисляет ничего и
   * снимка не передаёт — передавать нечего, поэтому устаревшим снимком он
   * ничего затереть не может (ADR 0001, раздел 8).
   *
   * `ResultObject` возвращается вызывающему и НИГДЕ не оседает: это рассказ об
   * одном вызове, у него нет владельца в состоянии.
   */
  const runGmAction = useCallback(
    async (command: string, args: Record<string, unknown>) => {
      try {
        const response = await invoke<GmResponse>(command, args);
        commit(response.state);
        setError(null);
        return response.result;
      } catch (e) {
        setError(String(e));
        return null;
      }
    },
    [commit],
  );

  const gmCreateScene = useCallback(
    (location: string, objective: string, participants: string[], tags: string[]) =>
      runGmAction("gm_create_scene", { location, objective, participants, tags }),
    [runGmAction],
  );
  const gmEndScene = useCallback(
    (outcome: SceneOutcome) => runGmAction("gm_end_scene", { outcome }),
    [runGmAction],
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
        gmCreateScene,
        gmEndScene,
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
