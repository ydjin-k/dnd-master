import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useCampaign } from "../../state/CampaignContext";
import type { DungeonRecord, MonsterTemplate, RollResult, RuleTopic } from "../../state/types";
import { playDiceRollSound } from "../../audio/uiSounds";
import { MonsterStatBlock, useMonsterDetailImage } from "../bestiary/MonsterStatBlock";
import { DungeonMap, MarkerGlyph } from "../dungeons/DungeonMap";
import { DoorBreakLine } from "../dungeons/DoorBreakLine";
import { ReadyTrapPicker, ReadyTrapView } from "../dungeons/ReadyTrapView";
import { readObjectToughness, type ObjectToughness } from "../dungeons/doorToughness";
import {
  builtTrap,
  findReadyTrap,
  isReadyTrap,
  readyTrapPick,
  type PlacedTrap,
  type ReadyTrap,
} from "../dungeons/readyTraps";
import {
  DEFAULT_FLOOR_COUNT,
  FLOOR_COUNTS,
  floorCount,
  floorFields,
  floorLabel,
  floorLabelFrom,
  floorPlan,
  planFloor,
  stairsTarget,
  type FloorCount,
} from "../dungeons/dungeonFloors";
import { noteOf, withNote } from "../dungeons/dungeonNotes";
import { dungeonMapPngBase64, pngFileName, sheetTitle } from "../dungeons/DungeonMapImage";
import {
  openPlayersWindow,
  playersMapView,
  publishPlayersMap,
} from "../dungeons/playersMap";
import { MAP_AUDIENCES, MAP_AUDIENCE_LABELS, type MapAudience } from "../dungeons/mapAudience";
import { DungeonRooms, RoomLegend } from "../dungeons/DungeonRooms";
import { NoteField } from "../dungeons/NoteField";
import { findDungeonTable } from "../eventTables/dungeonTables";
import {
  DUNGEON_SIZES,
  dungeonSizeOf,
  generateFloorPlans,
  lineDetail,
  lineTitle,
  markerLabel,
  MARKER_KIND_LABELS,
  MARKER_KINDS,
  type DungeonMarker,
  type DungeonPlan,
  type DungeonRoom,
  type DungeonSize,
} from "../dungeons/dungeonGenerator";
import { lootContentsLine } from "../dungeons/dungeonLoot";
import {
  randomSeed,
  readSeedInput,
  rebuildLosses,
  withDungeonRebuilt,
  withDungeonRenamed,
} from "../dungeons/dungeonEdit";
import {
  dungeonsOf,
  MARKER_STATUS_LABELS,
  MARKER_STATUSES,
  markerStatusOf,
  nextMarkerStatus,
  withMarkerAdvanced,
  withRoomAdvanced,
} from "../dungeons/markerStatus";
import {
  buildTrap,
  TRAP_LAYER_TABLE_IDS,
  trapLayerTable,
  withLayerRerolled,
  type Trap,
  type TrapLayerId,
} from "../dungeons/trapBuilder";
import {
  cellPlace,
  isMasterPlaced,
  withMarkerRemoved,
  withTrapPlaced,
} from "../dungeons/trapPlacement";
import {
  PARTY_LEVEL_MAX,
  PARTY_LEVEL_MIN,
  rangeRollExpression,
  readTrapNumbers,
  TRAP_DANGERS,
  type TrapDanger,
  type TrapNumbers,
} from "../dungeons/trapNumbers";
import "./DungeonsPage.css";

/**
 * Вкладка «Подземелья»: генератор ловушки и генератор схемы подземелья.
 *
 * Экран не владеет ни одним правилом. Числа ловушек — `trapNumbers.ts` из
 * `rules.json`, слои — таблицы «восьми тем», схема — `dungeonGenerator.ts` по
 * своим таблицам студии, статусы — `markerStatus.ts`. Кости ловушки бросает
 * движок (`roll_dice`); схеме нужна повторяемость, поэтому её строит семя.
 */
type View = "menu" | "trap" | "dungeons";

async function rollDie(expression: string): Promise<number> {
  return (await invoke<RollResult>("roll_dice", { expression })).total;
}

/** Уровень отряда по умолчанию — средний по персонажам кампании. */
function defaultPartyLevel(levels: number[]): number {
  if (levels.length === 0) return PARTY_LEVEL_MIN;
  const mean = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
  return Math.min(PARTY_LEVEL_MAX, Math.max(PARTY_LEVEL_MIN, mean));
}

/**
 * Справочник вкладки одним чтением: числа ловушек вместе с готовыми
 * (`trapNumbers.ts`) и крепость предметов для дверей (`doorToughness.ts`).
 * Запрос к движку один — разделы `rules.json` приходят вместе, и второго
 * похода за ними нет.
 */
function useDungeonRules(): {
  numbers: TrapNumbers | null;
  doors: ObjectToughness | null;
  error: string | null;
} {
  const [numbers, setNumbers] = useState<TrapNumbers | null>(null);
  const [doors, setDoors] = useState<ObjectToughness | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    invoke<RuleTopic[] | null>("get_rules")
      .then((topics) => {
        const read = readTrapNumbers(topics ?? []);
        setNumbers(read);
        setDoors(readObjectToughness(topics ?? []));
        if (!read) setError("В справочнике нет таблиц ловушек");
      })
      .catch((e) => setError(String(e)));
  }, []);
  return { numbers, doors, error };
}

/**
 * Уровень отряда и опасность. `disabled` гасит оба: числа готовой ловушки свои,
 * из справочника, и этими двумя ручками их не сдвинуть — пусть это будет видно
 * на экране, а не только в тексте.
 */
function PartyControls({
  level,
  danger,
  onLevel,
  onDanger,
  disabled = false,
}: {
  level: number;
  danger: TrapDanger;
  onLevel: (level: number) => void;
  onDanger: (danger: TrapDanger) => void;
  disabled?: boolean;
}) {
  return (
    <div className="dungeons-page__controls">
      <label className="dungeons-page__level">
        Уровень отряда
        <select
          value={level}
          disabled={disabled}
          onChange={(e) => onLevel(Number(e.currentTarget.value))}
        >
          {Array.from({ length: PARTY_LEVEL_MAX }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <div className="dungeons-page__dangers" role="group" aria-label="Опасность">
        {TRAP_DANGERS.map((d) => (
          <button
            key={d}
            type="button"
            className={"dm-tab" + (d === danger ? " is-selected" : "")}
            aria-pressed={d === danger}
            disabled={disabled}
            onClick={() => onDanger(d)}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Размер, назначение и семя на форме создания.
 *
 * Названия размеров берутся из `DUNGEON_SIZES`, строки назначения — из таблицы
 * `dungeon-purpose`; своих списков экран не держит. «Случайно» — пустое
 * значение списка: бросить назначение решает генератор, когда `purposeRoll`
 * пуст, и второго владельца этого правила здесь нет.
 */
function CreateOptions({
  size,
  floors,
  purposeRoll,
  seedText,
  onSize,
  onFloors,
  onPurpose,
  onSeed,
}: {
  size: DungeonSize;
  floors: FloorCount;
  purposeRoll: number | null;
  seedText: string;
  onSize: (size: DungeonSize) => void;
  onFloors: (floors: FloorCount) => void;
  onPurpose: (roll: number | null) => void;
  onSeed: (text: string) => void;
}) {
  const purposes = findDungeonTable("dungeon-purpose")?.rows ?? [];
  return (
    <div className="dungeons-page__controls">
      <div className="dungeons-page__dangers" role="group" aria-label="Размер">
        {DUNGEON_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            className={"dm-tab" + (s === size ? " is-selected" : "")}
            aria-pressed={s === size}
            onClick={() => onSize(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="dungeons-page__level">
        Этажей
        <select
          value={floors}
          onChange={(e) => onFloors(Number(e.currentTarget.value) as FloorCount)}
        >
          {FLOOR_COUNTS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <label className="dungeons-page__level">
        Назначение
        <select
          value={purposeRoll ?? ""}
          onChange={(e) => {
            const value = e.currentTarget.value;
            onPurpose(value === "" ? null : Number(value));
          }}
        >
          <option value="">Случайно</option>
          {purposes.map((row) => (
            <option key={row.from} value={row.from}>{lineTitle(row.text)}</option>
          ))}
        </select>
      </label>
      <label className="dungeons-page__level">
        Номер схемы
        <input
          className="dungeons-page__seed-input"
          type="text"
          inputMode="numeric"
          placeholder="случайный"
          value={seedText}
          onChange={(e) => onSeed(e.currentTarget.value)}
        />
      </label>
    </div>
  );
}

/**
 * Переключатель этажей над схемой. У одноэтажного подземелья его нет вовсе:
 * одна вкладка «Этаж 1» ничего не переключает и только занимает строку в окне
 * 620 px.
 *
 * Сколько этажей — спрашивается у записи (`floorCount`), а не передаётся
 * числом: иначе вкладок могло бы оказаться больше, чем схем.
 */
function FloorTabs({
  dungeon,
  floor,
  onFloor,
}: {
  dungeon: DungeonRecord;
  floor: number;
  onFloor: (floor: number) => void;
}) {
  const count = floorCount(dungeon);
  if (count < 2) return null;
  return (
    <div className="dungeons-page__floors" role="group" aria-label="Этаж">
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={"dm-tab" + (n === floor ? " is-selected" : "")}
          aria-pressed={n === floor}
          onClick={() => onFloor(n)}
        >
          {floorLabel(n)}
        </button>
      ))}
    </div>
  );
}

/**
 * Поле названия подземелья. Пустое имя не отправляется, но отказ принадлежит
 * не этой форме, а `withDungeonRenamed`: кнопка здесь только погашена, чтобы
 * мастер не тыкал в заведомо отказанное.
 */
function RenameForm({
  name,
  onSave,
  onCancel,
}: {
  name: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const empty = draft.trim().length === 0;
  return (
    <span className="dungeons-page__rename">
      <input
        aria-label="Название подземелья"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !empty) onSave(draft);
          if (e.key === "Escape") onCancel();
        }}
      />
      <button type="button" disabled={empty} onClick={() => onSave(draft)}>Сохранить</button>
      <button type="button" onClick={onCancel}>Отмена</button>
    </span>
  );
}

/**
 * Числа собранной ловушки: выпавшее значение и рядом промежуток справочника.
 * Откуда промежуток — сказано в подвале приложения одной строкой, и здесь это
 * не повторяется.
 */
function TrapNumbersView({ trap }: { trap: Trap }) {
  return (
    <dl className="dungeons-page__numbers">
      <div>
        <dt>УС спасброска</dt>
        <dd>
          <b>{trap.saveDc}</b> <span className="dungeons-page__range">из {trap.saveDcRange}</span>
        </dd>
      </div>
      {trap.attackBonus !== null && (
        <div>
          <dt>Бонус атаки</dt>
          <dd>
            <b>+{trap.attackBonus}</b>{" "}
            <span className="dungeons-page__range">из {trap.attackRange}</span>
          </dd>
        </div>
      )}
      {trap.damage !== null ? (
        <div>
          <dt>Урон</dt>
          <dd>
            <b>{trap.damage}</b>{" "}
            <span className="dungeons-page__range">уровень {trap.partyLevel}, {trap.danger.toLowerCase()}</span>
          </dd>
        </div>
      ) : (
        <div>
          <dt>Урон</dt>
          <dd className="dungeons-page__range">нет — этот эффект не ранит</dd>
        </div>
      )}
    </dl>
  );
}

function TrapLayers({ trap, onReroll }: { trap: Trap; onReroll?: (layer: TrapLayerId) => void }) {
  return (
    <ul className="dungeons-page__layers">
      {trap.layers.map((layer) => (
        <li key={layer.tableId} data-layer={layer.tableId}>
          <span className="dungeons-page__layer-name">
            {layer.tableName} <span className="dungeons-page__range">к{layer.die} = {layer.roll}</span>
          </span>
          <span className="dungeons-page__layer-text">{layer.text}</span>
          {onReroll && (
            <button type="button" className="dungeons-page__reroll" onClick={() => onReroll(layer.tableId)}>
              Перебросить
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Что делает кнопка: собирает ловушку из слоёв или берёт готовую. */
type TrapMode = "built" | "ready";

function TrapGenerator({ onBack, startLevel }: { onBack: () => void; startLevel: number }) {
  const { state, setDungeons } = useCampaign();
  const { numbers, error: loadError } = useDungeonRules();
  const [level, setLevel] = useState(startLevel);
  const [danger, setDanger] = useState<TrapDanger>("Опасная");
  const [mode, setMode] = useState<TrapMode>("built");
  /** Выбранная готовая ловушка или `null` — «Случайная», её бросает кость. */
  const [readyName, setReadyName] = useState<string | null>(null);
  const [trap, setTrap] = useState<PlacedTrap | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Подземелье, в котором мастер сейчас выбирает клетку, или `null`. */
  const [placingIn, setPlacingIn] = useState<string | null>(null);
  /**
   * Этаж, на который мастер ставит ловушку. Здесь, в отличие от «Подземелий»,
   * открытого этажа нет вовсе: ловушку ставят из генератора ловушки, и этаж
   * приходится выбирать тут же, рядом с подземельем.
   */
  const [placingFloor, setPlacingFloor] = useState(1);
  const [placed, setPlaced] = useState<string | null>(null);
  const dungeons = dungeonsOf(state);
  const target = dungeons.find((d) => d.id === placingIn) ?? null;
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const readyTraps = numbers?.ready ?? [];
  const built = builtTrap(trap);

  // Схема для выбора клетки открывается НИЖЕ собранной ловушки, а в узком окне
  // ловушка занимает весь экран: без прокрутки нажатие «Поставить в
  // подземелье» выглядит как «ничего не произошло». `scrollIntoView` под `?.` —
  // в jsdom его нет.
  useEffect(() => {
    if (target) pickerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [placingIn, target]);

  /**
   * Собирает ловушку из слоёв или берёт готовую — одной кнопкой, по
   * переключателю. Готовая «Случайная» выпадает костью движка по длине списка
   * справочника: своего числа одиннадцать здесь нет.
   */
  async function assemble() {
    if (!numbers || busy) return;
    setBusy(true);
    setError(null);
    setPlacingIn(null);
    setPlaced(null);
    try {
      if (mode === "ready") {
        if (readyTraps.length === 0) {
          setError("В справочнике нет готовых ловушек");
          return;
        }
        const roll = readyName === null ? await rollDie(`1d${readyTraps.length}`) : 1;
        const inRange = Math.min(Math.max(roll, 1), readyTraps.length);
        setTrap(readyTrapPick(readyName ?? readyTraps[inRange - 1].name));
        playDiceRollSound();
        return;
      }
      const layers = {} as Record<TrapLayerId, number>;
      for (const id of TRAP_LAYER_TABLE_IDS) layers[id] = await rollDie(`1d${trapLayerTable(id).die}`);
      const { saveDc, attackBonus } = numbers.severity[danger];
      const saveDcRoll = await rollDie(rangeRollExpression(saveDc));
      const attackRoll = await rollDie(rangeRollExpression(attackBonus));
      setTrap(buildTrap(numbers, level, danger, { layers, saveDcRoll, attackRoll }));
      playDiceRollSound();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reroll(layer: TrapLayerId) {
    if (!numbers || !built || busy) return;
    setBusy(true);
    setPlaced(null);
    try {
      const roll = await rollDie(`1d${trapLayerTable(layer).die}`);
      setTrap(withLayerRerolled(numbers, built, layer, roll));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ставит собранную ловушку отметкой в подземелье кампании. Отметку собирает
   * `withTrapPlaced` — он же решает, свободна ли клетка; экран только зовёт его
   * и подписывает место. Числа у отметки остаются те, с которыми ловушку
   * собрали, даже если у подземелья другой уровень отряда и другая опасность:
   * мастер поставил ИМЕННО эту ловушку.
   */
  async function place(dungeon: DungeonRecord, x: number, y: number) {
    if (!trap) return;
    const onFloor = planFloor(floorPlan(dungeon, placingFloor));
    await setDungeons((list) =>
      list.map((d) => (d.id === dungeon.id ? withTrapPlaced(d, trap, x, y, onFloor) ?? d : d)),
    );
    const where = cellPlace(floorPlan(dungeon, onFloor), x, y);
    setPlaced(
      floorCount(dungeon) > 1
        ? `Ловушка поставлена: «${dungeon.name}», ${floorLabel(onFloor).toLowerCase()}, ${where}`
        : `Ловушка поставлена: «${dungeon.name}», ${where}`,
    );
    setPlacingIn(null);
  }

  return (
    <section className="dungeons-page">
      <div className="dungeons-page__head">
        <button type="button" className="dungeons-page__back" onClick={onBack}>← Назад</button>
        <h2>Ловушка</h2>
      </div>
      <div className="dungeons-page__panel">
        <div className="dungeons-page__dangers" role="group" aria-label="Вид ловушки">
          {(
            [
              ["built", "Собрать из слоёв"],
              ["ready", "Готовая ловушка"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={"dm-tab" + (value === mode ? " is-selected" : "")}
              aria-pressed={value === mode}
              disabled={value === "ready" && readyTraps.length === 0}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <PartyControls
          level={level}
          danger={danger}
          onLevel={setLevel}
          onDanger={setDanger}
          disabled={mode === "ready"}
        />
        {mode === "ready" && (
          <>
            <ReadyTrapPicker traps={readyTraps} name={readyName} onPick={setReadyName} />
            <p className="dungeons-page__range">
              У готовой ловушки числа свои, из справочника: уровень отряда и опасность их не
              меняют.
            </p>
          </>
        )}
        <button type="button" className="dm-button--primary" onClick={assemble} disabled={!numbers || busy}>
          {mode === "ready" ? "Взять готовую" : "Собрать ловушку"}
        </button>
        {(loadError || error) && <p className="dungeons-page__error">{loadError ?? error}</p>}
      </div>
      {trap && (
        <article
          className="dungeons-page__panel dungeons-page__trap"
          aria-label={built ? "Собранная ловушка" : "Готовая ловушка"}
        >
          {built ? (
            <>
              <h3>
                Ловушка · {built.danger}, отряд {built.partyLevel} ур.
              </h3>
              <TrapNumbersView trap={built} />
              <TrapLayers trap={built} onReroll={reroll} />
            </>
          ) : (
            isReadyTrap(trap) && (
              <>
                <h3>Готовая ловушка</h3>
                <ReadyTrapView name={trap.name} trap={findReadyTrap(readyTraps, trap.name)} />
              </>
            )
          )}
          <div className="dungeons-page__status">
            <button
              type="button"
              disabled={dungeons.length === 0}
              title={
                dungeons.length === 0 ? "В этой кампании ещё нет ни одного подземелья" : undefined
              }
              onClick={() => {
                setPlaced(null);
                setPlacingIn(dungeons[0]?.id ?? null);
              }}
            >
              Поставить в подземелье
            </button>
            {dungeons.length === 0 && (
              <span className="dungeons-page__range">
                Ставить некуда: создайте подземелье в «Подземельях кампании».
              </span>
            )}
            {placed && <span className="dungeons-page__placed">{placed}</span>}
          </div>
        </article>
      )}
      {target && (
        <div className="dungeons-page__panel" aria-label="Куда поставить ловушку" ref={pickerRef}>
          <div className="dungeons-page__controls">
            <label className="dungeons-page__level">
              Подземелье
              <select
                aria-label="Подземелье"
                value={target.id}
                onChange={(e) => {
                  setPlacingIn(e.currentTarget.value);
                  // У другого подземелья этажей может быть меньше — выбор
                  // этажа начинается заново, а не остаётся висеть на третьем.
                  setPlacingFloor(1);
                }}
              >
                {dungeons.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <FloorTabs dungeon={target} floor={placingFloor} onFloor={setPlacingFloor} />
            <button type="button" onClick={() => setPlacingIn(null)}>Отмена</button>
          </div>
          <p className="dungeons-page__range">
            Щёлкните свободную клетку пола — комнату или проход. Клетки под другими отметками
            не выбираются.
          </p>
          <div className="dungeon-map">
            <DungeonMap
              dungeon={target}
              floor={placingFloor}
              selectedId={null}
              onSelect={() => undefined}
              onPlace={(x, y) => place(target, x, y)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function MarkerDetail({
  dungeon,
  plan,
  marker,
  readyTraps,
  doors,
  onAdvance,
  onNote,
  onRemove,
  onFloor,
}: {
  dungeon: DungeonRecord;
  /** Схема ОТКРЫТОГО этажа: в ней ищется номер отметки и семя двери. */
  plan: DungeonPlan;
  marker: DungeonMarker;
  /** Готовые ловушки справочника — по имени из записи берётся текст. */
  readyTraps: readonly ReadyTrap[];
  /** Крепость предметов; `null` — справочник ещё не прочитан. */
  doors: ObjectToughness | null;
  onAdvance: () => void;
  onNote: (text: string) => void;
  onRemove: () => void;
  /** Переход по лестнице: экран открывает названный этаж. */
  onFloor: (floor: number) => void;
}) {
  const status = markerStatusOf(dungeon, marker.id);
  const number = plan.markers.findIndex((m) => m.id === marker.id) + 1;
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Куда ведёт лестница, считает `dungeonFloors.ts` по этажу схемы и
  // направлению отметки; этаж за подземельем экран не домысливает.
  const target = stairsTarget(plan, marker);
  const goes = target !== null && target >= 1 && target <= floorCount(dungeon);
  // Убрать можно только поставленное руками: что выпало по таблицам — схема, и
  // чистить её выборочно мастеру незачем. Решает это `isMasterPlaced`, а не
  // вид отметки: ручная ловушка и генераторная выглядят одинаково.
  const mine = isMasterPlaced(marker);
  return (
    <article className="dungeons-page__panel dungeons-page__marker" aria-label="Описание отметки">
      <h3>
        {number}. {markerLabel(marker)}
        {marker.connects && (
          <span className="dungeons-page__range"> · комнаты {marker.connects[0]} ↔ {marker.connects[1]}</span>
        )}
        {mine && <span className="dungeons-page__range"> · поставлена мастером</span>}
      </h3>
      {marker.line && (
        <p>
          <b>{lineTitle(marker.line.text)}</b> — {lineDetail(marker.line.text)}
        </p>
      )}
      {/* Содержимое находки — отдельной строкой под ней: строка таблицы
          говорит, где находка лежит, а эта — что внутри. Подземелья,
          записанные до содержимого, поля не несут, и строки тут нет. */}
      {marker.contents && (
        <p>
          <b>Внутри:</b> {lootContentsLine(marker.contents)}
        </p>
      )}
      {marker.kind === "door" && (
        <DoorBreakLine
          toughness={doors}
          line={marker.line?.text ?? null}
          seed={plan.seed}
          markerId={marker.id}
        />
      )}
      {/* Лестница: своей короткой строкой — таблиц подземелья эта карточка не
          трогает, и бросков у лестницы нет вовсе. */}
      {marker.kind === "stairs" && goes && (
        <p>Ведёт на {floorLabel(target).toLowerCase()} этого же подземелья.</p>
      )}
      {marker.trap &&
        (isReadyTrap(marker.trap) ? (
          // Готовая отметка выглядит так же, как собранная: вид различает не
          // глиф, а описание — у готовой в нём текст справочника целиком.
          <ReadyTrapView
            name={marker.trap.name}
            trap={findReadyTrap(readyTraps, marker.trap.name)}
          />
        ) : (
          <>
            <TrapNumbersView trap={marker.trap} />
            <TrapLayers trap={marker.trap} />
          </>
        ))}
      {/* Заметка мастера — под описанием отметки, чем бы оно ни было: числами
          собранной ловушки, текстом готовой или строкой «Выбить» у двери. */}
      <NoteField
        label={`Заметка к отметке ${number}`}
        value={noteOf(dungeon, marker.id)}
        onChange={onNote}
      />
      <div className="dungeons-page__status">
        <span className="dm-chip" data-status={status}>{MARKER_STATUS_LABELS[status]}</span>
        <button type="button" onClick={onAdvance}>
          Отметить: {MARKER_STATUS_LABELS[nextMarkerStatus(status)]}
        </button>
        {goes && (
          <button type="button" onClick={() => onFloor(target)}>
            Перейти на {floorLabel(target).toLowerCase()}
          </button>
        )}
        {mine &&
          (confirmRemove ? (
            <span className="dungeons-page__confirm">
              Убрать отметку со схемы?
              <button
                type="button"
                onClick={() => {
                  setConfirmRemove(false);
                  onRemove();
                }}
              >
                Да, убрать
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)}>Нет</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)}>Убрать</button>
          ))}
      </div>
    </article>
  );
}

function Legend() {
  return (
    <div className="dungeons-page__legend" aria-label="Легенда">
      <h4>Виды отметок</h4>
      {MARKER_KINDS.map((kind) => (
        <div key={kind} className="dungeons-page__legend-row">
          <svg width="26" height="24" aria-hidden="true"><MarkerGlyph kind={kind} status="discovered" cx={13} cy={12} /></svg>
          {MARKER_KIND_LABELS[kind]}
        </div>
      ))}
      <h4>Статус</h4>
      {MARKER_STATUSES.map((status) => (
        <div key={status} className="dungeons-page__legend-row">
          <svg width="26" height="24" aria-hidden="true"><MarkerGlyph kind="trap" status={status} cx={13} cy={12} /></svg>
          {MARKER_STATUS_LABELS[status]}
        </div>
      ))}
      <p className="dungeons-page__range">
        Пунктир — ещё не исследовано; заливка — обнаружено; бледная с галочкой — исследовано.
        Щелчок по отметке открывает описание и смену статуса.
      </p>
      <RoomLegend />
    </div>
  );
}

function DungeonView({
  dungeon,
  bestiary,
  numbers,
  doors,
  onClose,
}: {
  dungeon: DungeonRecord;
  bestiary: readonly MonsterTemplate[];
  /** Числа ловушек нужны «Пересобрать»; `null` — справочник ещё не прочитан. */
  numbers: TrapNumbers | null;
  /** Крепость предметов — для строки «Выбить» у дверей. */
  doors: ObjectToughness | null;
  onClose: () => void;
}) {
  const { state, setDungeons, addToCombat } = useCampaign();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Комната, выбранная на схеме или в списке: они выделяют одну и ту же. */
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  /** Открытый этаж (считая с единицы) — им же выбирается схема. */
  const [floor, setFloor] = useState(1);
  const [renaming, setRenaming] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  /** Открыт выбор варианта картинки: лист мастера или лист игроков. */
  const [pickingSheet, setPickingSheet] = useState(false);
  /** Чем кончилось сохранение картинки — путь файла или причина отказа. */
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);
  /** Обитатель, чья карточка открыта, или `null`. */
  const [dwellerId, setDwellerId] = useState<string | null>(null);
  /** Номер комнаты, из которой подняли бой, — для подписи на месте. */
  const [raisedIn, setRaisedIn] = useState<number | null>(null);
  const plan = floorPlan(dungeon, floor);
  /**
   * Номер ОТКРЫТОЙ схемы, а не то, что лежит в состоянии: номер этажа и схему
   * этажа нельзя брать из двух разных мест. Если этажей у записи стало меньше,
   * `floorPlan` отдаёт первый, и ключи его комнат должны быть ключами первого
   * этажа, а не того, который экран помнил.
   */
  const atFloor = planFloor(plan);
  const selected = plan.markers.find((m) => m.id === selectedId) ?? null;
  const dweller = bestiary.find((m) => m.id === dwellerId) ?? null;
  const dwellerImage = useMonsterDetailImage(dweller);
  const creatureRef = useRef<HTMLElement | null>(null);
  const noCharacters = state.characters.length === 0;
  const anyDwellers = plan.rooms.some((r) => (r.dwellers?.monsters.length ?? 0) > 0);

  /**
   * Открытую карточку — к глазам. В узком окне столбцы встают друг под друга,
   * и карточка рождается ВЫШЕ списка комнат, по которому только что щёлкнули:
   * без этого нажатие на имя выглядит как «ничего не произошло» (видно на
   * живом окне 620 px). `scrollIntoView` под `?.` — в jsdom его нет.
   */
  useEffect(() => {
    if (dweller) creatureRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [dwellerId, dweller]);

  /** Что пропадёт при пересборке; пустой перечень — спрашивать не о чем. */
  const losses = rebuildLosses(dungeon);

  /**
   * Схема закрыта — окно игроков показывает заставку. Отдельной отпиской, а не
   * вместе с отправкой схемы ниже: иначе каждая смена статуса сперва гасила бы
   * окно до заставки и только потом показывала новую схему.
   */
  useEffect(() => () => void publishPlayersMap(null), []);

  /**
   * Открытая схема уезжает в окно игроков при каждой правке записи и при смене
   * этажа: сменил мастер статус, переключил этаж или открыл другое подземелье —
   * у стола это видно сразу, без перезагрузки окна. Что именно уезжает, решает
   * `playersMapView` (и `mapAudience.ts` за ним), а не экран.
   *
   * Зовётся и когда окно ещё не открыто: схема ложится в ящик и дождётся
   * открытия — поэтому мастеру не нужно помнить, в каком порядке он нажимал.
   */
  useEffect(() => {
    void publishPlayersMap(playersMapView(dungeon, atFloor, sheetTitle(dungeon, atFloor)));
  }, [dungeon, atFloor]);

  /**
   * Открывает другой этаж. Выбранные отметка и комната сбрасываются: `id`
   * отметки уникален по всему подземелью, и карточка от отметки чужого этажа
   * просто исчезла бы, а вот номер комнаты у этажей общий — не сбросив его,
   * мы подсветили бы на новом этаже комнату с тем же номером, которую мастер
   * не выбирал.
   */
  const goToFloor = (next: number) => {
    setFloor(next);
    setSelectedId(null);
    setSelectedRoom(null);
  };

  const advance = (markerId: string) =>
    setDungeons((list) => list.map((d) => (d.id === dungeon.id ? withMarkerAdvanced(d, markerId) : d)));

  const advanceRoom = (roomNumber: number) =>
    setDungeons((list) =>
      list.map((d) => (d.id === dungeon.id ? withRoomAdvanced(d, roomNumber, atFloor) : d)),
    );

  /** Заметка к отметке или комнате; ключ даёт тот, кто её показывает. */
  const note = (id: string, text: string) =>
    setDungeons((list) => list.map((d) => (d.id === dungeon.id ? withNote(d, id, text) : d)));

  const rename = async (name: string) => {
    setRenaming(false);
    await setDungeons((list) =>
      list.map((d) => (d.id === dungeon.id ? withDungeonRenamed(d, name) ?? d : d)),
    );
  };

  /**
   * Пересобирает схему новым семенем по тому же рецепту. Открытые описания
   * закрываются до записи: отметки новой схемы носят те же `id`, и оставленная
   * открытой карточка показывала бы описание от снесённой отметки.
   */
  const rebuild = async () => {
    if (!numbers) return;
    setConfirmRebuild(false);
    setSelectedId(null);
    setSelectedRoom(null);
    setDwellerId(null);
    setRaisedIn(null);
    // Пересобираются ВСЕ этажи, и открытый возвращается на первый: схема
    // второго этажа теперь другая, и оставить мастера на ней значило бы
    // показать ему чужое подземелье под прежней вкладкой.
    setFloor(1);
    // Семя берётся ДО обновления: внутри него `randomSeed()` могло бы
    // выполниться дважды и записать не ту схему, которую мастер увидел.
    const seed = randomSeed();
    await setDungeons((list) =>
      list.map((d) => (d.id === dungeon.id ? withDungeonRebuilt(d, seed, numbers, bestiary) : d)),
    );
  };

  const removeMarker = async (markerId: string) => {
    setSelectedId(null);
    await setDungeons((list) =>
      list.map((d) => (d.id === dungeon.id ? withMarkerRemoved(d, markerId) : d)),
    );
  };

  /**
   * Сохраняет схему картинкой PNG. Диалог «Сохранить как» — нативный, путь из
   * него уходит в команду записи `save_png_file`; что именно попадёт на лист,
   * решает `mapAudience.ts`, а рисует `DungeonMapImage.tsx`.
   *
   * Имя по умолчанию у двух листов РАЗНОЕ и считается в `pngFileName`: лист
   * игроков несёт свою подпись, а у многоэтажного подземелья в имя идёт
   * открытый этаж. Экран своего имени не складывает — иначе файл и заголовок
   * листа расходились бы в номере этажа.
   */
  const saveImage = async (audience: MapAudience) => {
    setPickingSheet(false);
    setSaved(null);
    try {
      const path = await save({
        // Этаж — тот же открытый, что уходит в картинку ниже.
        defaultPath: pngFileName(dungeon, audience, atFloor),
        filters: [{ name: "Картинка PNG", extensions: ["png"] }],
      });
      // Мастер закрыл диалог — это не отказ, и говорить о нём нечего.
      if (!path) return;
      // Этаж — ОТКРЫТЫЙ: лист сохраняет то, что мастер видит, а номер этажа
      // уходит в заголовок листа (`sheetTitle`), если этажей больше одного.
      const bytesBase64 = await dungeonMapPngBase64(dungeon, audience, atFloor);
      await invoke("save_png_file", { path, bytesBase64 });
      setSaved({ ok: true, text: `Схема сохранена: ${path}` });
    } catch (error) {
      setSaved({ ok: false, text: `Картинку сохранить не удалось: ${String(error)}` });
    }
  };

  /**
   * Выводит окно игроков на экран. Уже открытое — поднимает поверх остальных:
   * второго такого окна не бывает (`players.rs`).
   *
   * Отказ попадает в ту же строку состояния, что отказ сохранения картинки:
   * строка одна на весь экран схемы, и мастеру незачем знать, какая из кнопок
   * заводит свою.
   */
  const showToPlayers = async () => {
    setSaved(null);
    try {
      await openPlayersWindow();
    } catch (error) {
      setSaved({ ok: false, text: `Окно для игроков не открылось: ${String(error)}` });
    }
  };

  /**
   * Поднимает бой с обитателями комнаты тем же путём, что генератор событий
   * (`AdventuresPage`): противники — только те, кого назвала комната, а со
   * стороны отряда выходят все персонажи кампании; кого оставить в стороне,
   * решают за столом, на вкладке «Бой». Своего списка существ экран не
   * выдумывает — `id` лежат в схеме с рождения комнаты.
   */
  const raiseCombat = async (room: DungeonRoom) => {
    const monsters = room.dwellers?.monsters ?? [];
    if (monsters.length === 0) return;
    await addToCombat(
      monsters.map((m) => m.id),
      state.characters.map((c) => c.id),
    );
    setRaisedIn(room.number);
  };

  return (
    <section className="dungeons-page dungeons-page--wide">
      <div className="dungeons-page__head">
        <button type="button" className="dungeons-page__back" onClick={onClose}>← К списку</button>
        <h2>{dungeon.name}</h2>
      </div>
      {/* Назначение — у подземелья, а не у этажа, и берётся с первого этажа
          при любом открытом. Вход у нижних этажей свой: лестница сверху. */}
      <p className="dungeons-page__lead">
        {lineDetail(dungeon.plan.purpose?.text ?? "")} <b>Вход:</b>{" "}
        {atFloor === 1
          ? (dungeon.plan.entrance?.text ?? "")
          : `лестница с ${floorLabelFrom(atFloor - 1)}`}{" "}
        <span className="dungeons-page__range">
          Отряд {dungeon.partyLevel} ур. · ловушки «{dungeon.danger}» ·{" "}
          {dungeonSizeOf(dungeon.size).toLowerCase()} ·{" "}
          {floorCount(dungeon) > 1 ? `этажей ${floorCount(dungeon)} · ` : ""}номер схемы {dungeon.seed}
        </span>
      </p>
      <div className="dungeons-page__actions">
        {renaming ? (
          <RenameForm name={dungeon.name} onSave={rename} onCancel={() => setRenaming(false)} />
        ) : confirmRebuild ? (
          <span className="dungeons-page__confirm">
            Пересобрать схему заново? Пропадёт: {losses.join("; ")}.
            <button type="button" onClick={rebuild}>Да, пересобрать</button>
            <button type="button" onClick={() => setConfirmRebuild(false)}>Нет</button>
          </span>
        ) : pickingSheet ? (
          <span className="dungeons-page__confirm">
            Какую картинку сохранить?
            {MAP_AUDIENCES.map((audience) => (
              <button key={audience} type="button" onClick={() => saveImage(audience)}>
                {MAP_AUDIENCE_LABELS[audience]}
              </button>
            ))}
            <button type="button" onClick={() => setPickingSheet(false)}>Отмена</button>
            <span className="dungeons-page__range">
              На листе игроков нет ловушек, потайных ходов, заметок мастера и ещё не
              исследованных комнат и отметок.
            </span>
          </span>
        ) : (
          <>
            <button type="button" onClick={() => setRenaming(true)}>Переименовать</button>
            <button
              type="button"
              disabled={!numbers}
              title={numbers ? undefined : "Справочник ловушек ещё не прочитан"}
              onClick={() => (losses.length > 0 ? setConfirmRebuild(true) : rebuild())}
            >
              Пересобрать
            </button>
            <button type="button" onClick={() => { setSaved(null); setPickingSheet(true); }}>
              Сохранить картинкой
            </button>
            {/* Схема в окне игроков уже лежит (отправляется при каждой правке),
                кнопка только выводит окно на экран — поэтому нажать её можно и
                до, и после смены статусов, порядок ничего не меняет. */}
            <button type="button" onClick={showToPlayers}>
              Показать игрокам
            </button>
          </>
        )}
      </div>
      {saved && (
        <p className={saved.ok ? "dungeons-page__range" : "dungeons-page__error"} role="status">
          {saved.text}
        </p>
      )}
      <div className="dungeons-page__layout">
        <div className="dungeons-page__main">
          <FloorTabs dungeon={dungeon} floor={atFloor} onFloor={goToFloor} />
          <div className="dungeon-map">
            <DungeonMap
              dungeon={dungeon}
              floor={atFloor}
              selectedId={selectedId}
              onSelect={setSelectedId}
              selectedRoom={selectedRoom}
              onSelectRoom={setSelectedRoom}
            />
          </div>
          {selected && (
            <MarkerDetail
              key={selected.id}
              dungeon={dungeon}
              plan={plan}
              marker={selected}
              readyTraps={numbers?.ready ?? []}
              doors={doors}
              onAdvance={() => advance(selected.id)}
              onNote={(text) => note(selected.id, text)}
              onRemove={() => removeMarker(selected.id)}
              onFloor={goToFloor}
            />
          )}
          {dwellerId && !dweller && (
            <p className="dungeons-page__error">
              Этого существа в бестиарии больше нет — карточку показать нечем.
            </p>
          )}
          {dweller && (
            <section
              ref={creatureRef}
              className="dungeons-page__panel"
              aria-label={`Существо: ${dweller.name}`}
            >
              <button
                type="button"
                className="dungeons-page__creature-close"
                onClick={() => setDwellerId(null)}
              >
                Закрыть карточку
              </button>
              <MonsterStatBlock monster={dweller} image={dwellerImage} />
            </section>
          )}
        </div>
        <aside className="dungeons-page__side">
          <Legend />
          <DungeonRooms
            dungeon={dungeon}
            floor={atFloor}
            selectedRoom={selectedRoom}
            onSelectRoom={setSelectedRoom}
            onAdvanceRoom={advanceRoom}
            onNote={note}
            onDweller={setDwellerId}
            onRaiseCombat={raiseCombat}
            raisedIn={raisedIn}
            noCharacters={noCharacters}
          />
          {anyDwellers && noCharacters && (
            <p className="dungeons-page__range">
              Бой поднимать некем: добавьте персонажей на вкладке «Персонажи».
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

function DungeonList({ onBack, startLevel }: { onBack: () => void; startLevel: number }) {
  const { state, setDungeons } = useCampaign();
  const { numbers, doors, error: loadError } = useDungeonRules();
  const [bestiary, setBestiary] = useState<MonsterTemplate[] | null>(null);
  const [level, setLevel] = useState(startLevel);
  const [danger, setDanger] = useState<TrapDanger>("Опасная");
  const [size, setSize] = useState<DungeonSize>("Среднее");
  const [floors, setFloors] = useState<FloorCount>(DEFAULT_FLOOR_COUNT);
  const [purposeRoll, setPurposeRoll] = useState<number | null>(null);
  const [seedText, setSeedText] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /** Подземелье, которое сейчас переименовывают в списке, или `null`. */
  const [renameId, setRenameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dungeons = dungeonsOf(state);

  useEffect(() => {
    invoke<MonsterTemplate[] | null>("get_bestiary")
      .then((loaded) => setBestiary(loaded ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  const open = dungeons.find((d) => d.id === openId);
  if (open) {
    // Бестиарий уже загружен для генератора схемы; карточке обитателя он нужен
    // тот же самый, второго запроса здесь не делается.
    return (
      <DungeonView
        dungeon={open}
        bestiary={bestiary ?? []}
        numbers={numbers}
        doors={doors}
        onClose={() => setOpenId(null)}
      />
    );
  }

  async function create() {
    if (!numbers || !bestiary) return;
    setError(null);
    // Семя с формы читает `readSeedInput`: мусор — это отказ, а не молча
    // случайная схема вместо той, которую мастер хотел повторить.
    const asked = readSeedInput(seedText);
    if (asked.kind === "error") {
      setError(asked.message);
      return;
    }
    try {
      const seed = asked.kind === "seed" ? asked.seed : randomSeed();
      // Все этажи строит `generateFloorPlans`: семя каждого выводится из
      // общего, и лестницы расставляются по числу этажей. Семя записи — ОБЩЕЕ,
      // то, что мастер вписал в поле.
      const plans = generateFloorPlans(
        { seed, partyLevel: level, danger, numbers, bestiary, size, purposeRoll },
        floors,
      );
      const record: DungeonRecord = {
        id: crypto.randomUUID(),
        name: lineTitle(plans[0].purpose?.text ?? ""),
        createdAt: new Date().toISOString(),
        seed,
        partyLevel: level,
        danger,
        size,
        purposeRoll,
        ...floorFields(plans),
        statuses: {},
      };
      await setDungeons((list) => [...list, record]);
      setOpenId(record.id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function rename(id: string, name: string) {
    setRenameId(null);
    await setDungeons((list) =>
      list.map((d) => (d.id === id ? withDungeonRenamed(d, name) ?? d : d)),
    );
  }

  async function remove(id: string) {
    setConfirmId(null);
    await setDungeons((list) => list.filter((d) => d.id !== id));
  }

  return (
    <section className="dungeons-page">
      <div className="dungeons-page__head">
        <button type="button" className="dungeons-page__back" onClick={onBack}>← Назад</button>
        <h2>Подземелья</h2>
      </div>
      <div className="dungeons-page__panel">
        <PartyControls level={level} danger={danger} onLevel={setLevel} onDanger={setDanger} />
        <CreateOptions
          size={size}
          floors={floors}
          purposeRoll={purposeRoll}
          seedText={seedText}
          onSize={setSize}
          onFloors={setFloors}
          onPurpose={setPurposeRoll}
          onSeed={setSeedText}
        />
        <button type="button" className="dm-button--primary" onClick={create} disabled={!numbers || !bestiary}>
          Создать подземелье
        </button>
        {(loadError || error) && <p className="dungeons-page__error">{loadError ?? error}</p>}
      </div>
      {dungeons.length === 0 ? (
        <p className="dungeons-page__empty">В этой кампании подземелий пока нет.</p>
      ) : (
        <ul className="dungeons-page__list" aria-label="Подземелья кампании">
          {dungeons.map((d) => (
            <li key={d.id} className="dm-list-row">
              <span className="dungeons-page__list-name">
                <b>{d.name}</b>{" "}
                <span className="dungeons-page__range">
                  отряд {d.partyLevel} ур. · {d.danger} · {dungeonSizeOf(d.size).toLowerCase()} ·{" "}
                  {floorCount(d) > 1 ? `этажей ${floorCount(d)} · ` : ""}
                  {new Date(d.createdAt).toLocaleDateString("ru-RU")}
                </span>
              </span>
              {renameId === d.id ? (
                <RenameForm
                  name={d.name}
                  onSave={(name) => rename(d.id, name)}
                  onCancel={() => setRenameId(null)}
                />
              ) : confirmId === d.id ? (
                <span className="dungeons-page__confirm">
                  Удалить «{d.name}»?
                  <button type="button" onClick={() => remove(d.id)}>Да, удалить</button>
                  <button type="button" onClick={() => setConfirmId(null)}>Нет</button>
                </span>
              ) : (
                <span className="dungeons-page__row-actions">
                  <button type="button" onClick={() => setOpenId(d.id)}>Открыть</button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmId(null);
                      setRenameId(d.id);
                    }}
                  >
                    Переименовать
                  </button>
                  <button type="button" onClick={() => setConfirmId(d.id)}>Удалить</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DungeonsPage() {
  const { state } = useCampaign();
  const [view, setView] = useState<View>("menu");
  const startLevel = useMemo(
    () => defaultPartyLevel(state.characters.map((c) => c.level).filter((n) => Number.isFinite(n))),
    [state.characters],
  );

  if (view === "trap") return <TrapGenerator onBack={() => setView("menu")} startLevel={startLevel} />;
  if (view === "dungeons") return <DungeonList onBack={() => setView("menu")} startLevel={startLevel} />;

  return (
    <section className="dungeons-page">
      <h2>Подземелья</h2>
      <div className="dungeons-page__entries">
        <button type="button" className="dungeons-page__entry dm-button--primary" onClick={() => setView("trap")}>
          <span className="dungeons-page__entry-title">Собрать ловушку</span>
          <span className="dungeons-page__entry-hint">
            Пять слоёв из таблиц ловушек под уровень отряда и опасность — или готовая
            ловушка из справочника целиком
          </span>
        </button>
        <button type="button" className="dungeons-page__entry dm-button--primary" onClick={() => setView("dungeons")}>
          <span className="dungeons-page__entry-title">Подземелья кампании</span>
          <span className="dungeons-page__entry-hint">
            Схема с ловушками, дверьми, потайными ходами, лутом и точками интереса
          </span>
        </button>
      </div>
    </section>
  );
}
