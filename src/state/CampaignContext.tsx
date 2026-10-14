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
  type JournalEntry,
  type TravelState,
  emptyCampaignState,
} from "./types";
import { travelOf } from "../ui/travelPace";
import { JOURNAL_ENTRY_MAX_LENGTH, appendedText, clampToLength } from "../ui/journalEntryText";
import { deathSavesAtHp, normalizeDeathSaves, type DeathSaves } from "../ui/deathSaves";

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
  setTravel: (updater: (travel: TravelState) => TravelState) => Promise<void>;
  /** Существа по id шаблона (повтор id — ещё один боец того же вида) и персонажи кампании. */
  addToCombat: (monsterIds: string[], characterIds: string[]) => Promise<void>;
  /** Модификатор Ловкости каждого бойца по его id — из `initiativeModifierOf`. */
  rollInitiative: (dexModifiers: Record<string, number>) => Promise<void>;
  /** `fallen` — флаг «пал» на каждое место в `turnOrder` (`fallenFlags`): павших «Следующий» пропускает. */
  nextTurn: (fallen: boolean[]) => Promise<void>;
  /** Переключатель «по правилам персонажа» у существа. */
  setPlayerRules: (targetId: string, on: boolean) => Promise<void>;
  /** Счёт спасбросков существа — посчитанный `applyDeathSaveRoll`; у персонажа счёт на листе. */
  setCombatantDeathSaves: (targetId: string, saves: DeathSaves) => Promise<void>;
  /** Хиты в бою; поднятому с нуля следом обнуляется счёт спасбросков. */
  applyDamage: (targetId: string, delta: number) => Promise<void>;
  /** Убрать бойца; `position` — его место в `turnOrder`, по нему Rust ведёт указатель. */
  removeFromCombat: (targetId: string, position: number) => Promise<void>;
  transferHpToSheets: () => Promise<void>;
  endCombat: () => Promise<void>;
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

  /**
   * Счётчик пути. Через `persistWith`, а не `persist`: провал форсированного
   * марша пишет в кампанию дважды подряд — час в счётчик и степень истощения на
   * лист, — и обе записи ложатся до перерисовки. Со снимком рендера вторая
   * затирала бы первую вместе с пройденным часом.
   *
   * Умолчание подставляет `travelOf`, а не этот провайдер: кампания без темпа
   * обязана считаться «в путь не выходили» одинаково и здесь, и на экране.
   */
  const setTravel = useCallback(
    async (updater: (travel: TravelState) => TravelState) => {
      await persistWith((current) => ({ ...current, travel: updater(travelOf(current.travel)) }));
    },
    [persistWith],
  );

  // Бой сохраняется на бэкенде внутри команды — тут только применяем
  // результат. Общий враппер вместо шести одинаковых try/catch.
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

  const addToCombat = useCallback(
    (monsterIds: string[], characterIds: string[]) =>
      runServerAction("combat_add", { monsterIds, characterIds }),
    [runServerAction],
  );
  const rollInitiative = useCallback(
    (dexModifiers: Record<string, number>) =>
      runServerAction("combat_roll_initiative", { dexModifiers }),
    [runServerAction],
  );
  const nextTurn = useCallback(
    (fallen: boolean[]) => runServerAction("combat_next_turn", { fallen }),
    [runServerAction],
  );
  const setPlayerRules = useCallback(
    (targetId: string, on: boolean) => runServerAction("combat_set_player_rules", { targetId, on }),
    [runServerAction],
  );
  const setCombatantDeathSaves = useCallback(
    (targetId: string, saves: DeathSaves) =>
      runServerAction("combat_set_death_saves", {
        targetId,
        successes: saves.successes,
        failures: saves.failures,
      }),
    [runServerAction],
  );

  /**
   * Хиты в бою — и следом сброс счёта спасбросков, если боец поднялся с нуля.
   *
   * Лечение в бою пишет хиты НЕ в лист (перенос — только кнопкой), поэтому
   * воронка листа (`onUpdate` → `normalizeDeathSaves`) его не видит, а счёт
   * обязан обнулиться: SRD сбрасывает его любым восстановлением хитов. Здесь
   * зовётся тот же владелец сброса — `normalizeDeathSaves` с боем для персонажа
   * и `deathSavesAtHp` для существа, — а не третье «если хиты > 0».
   *
   * Считается от `latest`, то есть от ответа команды хитов, а не от снимка
   * рендера: иначе сброс смотрел бы на хиты ДО лечения.
   */
  const applyDamage = useCallback(
    async (targetId: string, delta: number) => {
      await runServerAction("apply_damage", { targetId, delta });
      const current = latest.current;
      const combatant = current.combat?.combatants.find((c) => c.id === targetId);
      if (!combatant) return;
      const source = combatant.source;
      if (source.kind === "character") {
        const sheet = current.characters.find((c) => c.id === source.characterId);
        if (sheet && normalizeDeathSaves(sheet, current.combat) !== sheet) {
          await updateCharacter(sheet.id, (ch) => normalizeDeathSaves(ch, latest.current.combat));
        }
        return;
      }
      const saves = { successes: combatant.deathSaveSuccesses, failures: combatant.deathSaveFailures };
      const settled = deathSavesAtHp(saves, combatant.currentHp);
      if (settled.successes !== saves.successes || settled.failures !== saves.failures) {
        await setCombatantDeathSaves(targetId, settled);
      }
    },
    [runServerAction, updateCharacter, setCombatantDeathSaves],
  );
  const removeFromCombat = useCallback(
    (targetId: string, position: number) =>
      runServerAction("combat_remove", { targetId, position }),
    [runServerAction],
  );
  const transferHpToSheets = useCallback(
    () => runServerAction("combat_transfer_hp_to_sheets"),
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
        setTravel,
        addToCombat,
        rollInitiative,
        nextTurn,
        setPlayerRules,
        setCombatantDeathSaves,
        applyDamage,
        removeFromCombat,
        transferHpToSheets,
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
