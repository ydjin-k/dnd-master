import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import type { DungeonRecord, MonsterTemplate, RollResult, RuleTopic } from "../../state/types";
import { playDiceRollSound } from "../../audio/uiSounds";
import { MonsterStatBlock, useMonsterDetailImage } from "../bestiary/MonsterStatBlock";
import { DungeonMap, MarkerGlyph } from "../dungeons/DungeonMap";
import {
  generateDungeon,
  lineDetail,
  lineTitle,
  MARKER_KIND_LABELS,
  MARKER_KINDS,
  type DungeonMarker,
  type DungeonRoom,
} from "../dungeons/dungeonGenerator";
import {
  dungeonsOf,
  MARKER_STATUS_LABELS,
  MARKER_STATUSES,
  markerStatusOf,
  nextMarkerStatus,
  withMarkerAdvanced,
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

function useTrapNumbers(): { numbers: TrapNumbers | null; error: string | null } {
  const [numbers, setNumbers] = useState<TrapNumbers | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    invoke<RuleTopic[] | null>("get_rules")
      .then((topics) => {
        const read = readTrapNumbers(topics ?? []);
        setNumbers(read);
        if (!read) setError("В справочнике нет таблиц ловушек SRD");
      })
      .catch((e) => setError(String(e)));
  }, []);
  return { numbers, error };
}

function PartyControls({
  level,
  danger,
  onLevel,
  onDanger,
}: {
  level: number;
  danger: TrapDanger;
  onLevel: (level: number) => void;
  onDanger: (danger: TrapDanger) => void;
}) {
  return (
    <div className="dungeons-page__controls">
      <label className="dungeons-page__level">
        Уровень отряда
        <select value={level} onChange={(e) => onLevel(Number(e.currentTarget.value))}>
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
            onClick={() => onDanger(d)}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Числа ловушки: выпавшее значение и рядом промежуток SRD. */
function TrapNumbersView({ trap }: { trap: Trap }) {
  return (
    <dl className="dungeons-page__numbers">
      <div>
        <dt>УС спасброска</dt>
        <dd>
          <b>{trap.saveDc}</b> <span className="dungeons-page__range">SRD {trap.saveDcRange}</span>
        </dd>
      </div>
      {trap.attackBonus !== null && (
        <div>
          <dt>Бонус атаки</dt>
          <dd>
            <b>+{trap.attackBonus}</b> <span className="dungeons-page__range">SRD {trap.attackRange}</span>
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

function TrapGenerator({ onBack, startLevel }: { onBack: () => void; startLevel: number }) {
  const { state, setDungeons } = useCampaign();
  const { numbers, error: loadError } = useTrapNumbers();
  const [level, setLevel] = useState(startLevel);
  const [danger, setDanger] = useState<TrapDanger>("Опасная");
  const [trap, setTrap] = useState<Trap | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Подземелье, в котором мастер сейчас выбирает клетку, или `null`. */
  const [placingIn, setPlacingIn] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);
  const dungeons = dungeonsOf(state);
  const target = dungeons.find((d) => d.id === placingIn) ?? null;
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Схема для выбора клетки открывается НИЖЕ собранной ловушки, а в узком окне
  // ловушка занимает весь экран: без прокрутки нажатие «Поставить в
  // подземелье» выглядит как «ничего не произошло». `scrollIntoView` под `?.` —
  // в jsdom его нет.
  useEffect(() => {
    if (target) pickerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [placingIn, target]);

  async function assemble() {
    if (!numbers || busy) return;
    setBusy(true);
    setError(null);
    setPlacingIn(null);
    setPlaced(null);
    try {
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
    if (!numbers || !trap || busy) return;
    setBusy(true);
    setPlaced(null);
    try {
      const roll = await rollDie(`1d${trapLayerTable(layer).die}`);
      setTrap(withLayerRerolled(numbers, trap, layer, roll));
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
    await setDungeons((list) =>
      list.map((d) => (d.id === dungeon.id ? withTrapPlaced(d, trap, x, y) ?? d : d)),
    );
    setPlaced(`Ловушка поставлена: «${dungeon.name}», ${cellPlace(dungeon.plan, x, y)}`);
    setPlacingIn(null);
  }

  return (
    <section className="dungeons-page">
      <div className="dungeons-page__head">
        <button type="button" className="dungeons-page__back" onClick={onBack}>← Назад</button>
        <h2>Ловушка</h2>
      </div>
      <div className="dungeons-page__panel">
        <PartyControls level={level} danger={danger} onLevel={setLevel} onDanger={setDanger} />
        <button type="button" className="dm-button--primary" onClick={assemble} disabled={!numbers || busy}>
          Собрать ловушку
        </button>
        {(loadError || error) && <p className="dungeons-page__error">{loadError ?? error}</p>}
      </div>
      {trap && (
        <article className="dungeons-page__panel dungeons-page__trap" aria-label="Собранная ловушка">
          <h3>
            Ловушка · {trap.danger}, отряд {trap.partyLevel} ур.
          </h3>
          <TrapNumbersView trap={trap} />
          <TrapLayers trap={trap} onReroll={reroll} />
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
                onChange={(e) => setPlacingIn(e.currentTarget.value)}
              >
                {dungeons.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setPlacingIn(null)}>Отмена</button>
          </div>
          <p className="dungeons-page__range">
            Щёлкните свободную клетку пола — комнату или проход. Клетки под другими отметками
            не выбираются.
          </p>
          <div className="dungeon-map">
            <DungeonMap
              dungeon={target}
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
  marker,
  onAdvance,
  onRemove,
}: {
  dungeon: DungeonRecord;
  marker: DungeonMarker;
  onAdvance: () => void;
  onRemove: () => void;
}) {
  const status = markerStatusOf(dungeon, marker.id);
  const number = dungeon.plan.markers.findIndex((m) => m.id === marker.id) + 1;
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Убрать можно только поставленное руками: что выпало по таблицам — схема, и
  // чистить её выборочно мастеру незачем. Решает это `isMasterPlaced`, а не
  // вид отметки: ручная ловушка и генераторная выглядят одинаково.
  const mine = isMasterPlaced(marker);
  return (
    <article className="dungeons-page__panel dungeons-page__marker" aria-label="Описание отметки">
      <h3>
        {number}. {MARKER_KIND_LABELS[marker.kind]}
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
      {marker.trap && (
        <>
          <TrapNumbersView trap={marker.trap} />
          <TrapLayers trap={marker.trap} />
        </>
      )}
      <div className="dungeons-page__status">
        <span className="dm-chip" data-status={status}>{MARKER_STATUS_LABELS[status]}</span>
        <button type="button" onClick={onAdvance}>
          Отметить: {MARKER_STATUS_LABELS[nextMarkerStatus(status)]}
        </button>
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
    </div>
  );
}

function DungeonView({
  dungeon,
  bestiary,
  onClose,
}: {
  dungeon: DungeonRecord;
  bestiary: readonly MonsterTemplate[];
  onClose: () => void;
}) {
  const { state, setDungeons, addToCombat } = useCampaign();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Обитатель, чья карточка открыта, или `null`. */
  const [dwellerId, setDwellerId] = useState<string | null>(null);
  /** Номер комнаты, из которой подняли бой, — для подписи на месте. */
  const [raisedIn, setRaisedIn] = useState<number | null>(null);
  const { plan } = dungeon;
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

  const advance = (markerId: string) =>
    setDungeons((list) => list.map((d) => (d.id === dungeon.id ? withMarkerAdvanced(d, markerId) : d)));

  const removeMarker = async (markerId: string) => {
    setSelectedId(null);
    await setDungeons((list) =>
      list.map((d) => (d.id === dungeon.id ? withMarkerRemoved(d, markerId) : d)),
    );
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
      <p className="dungeons-page__lead">
        {lineDetail(plan.purpose.text)} <b>Вход:</b> {plan.entrance.text}{" "}
        <span className="dungeons-page__range">
          Отряд {dungeon.partyLevel} ур. · ловушки «{dungeon.danger}»
        </span>
      </p>
      <div className="dungeons-page__layout">
        <div className="dungeons-page__main">
          <div className="dungeon-map">
            <DungeonMap dungeon={dungeon} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          {selected && (
            <MarkerDetail
              key={selected.id}
              dungeon={dungeon}
              marker={selected}
              onAdvance={() => advance(selected.id)}
              onRemove={() => removeMarker(selected.id)}
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
          <h4>Комнаты</h4>
          <ol className="dungeons-page__rooms">
            {plan.rooms.map((room) => (
              <li key={room.number}>
                {room.kind.text}
                {room.dwellers && (
                  <div className="dungeons-page__dwellers">
                    <span className="dungeons-page__range">Обитатели:</span> {room.dwellers.text}
                    {room.dwellers.monsters.length > 0 && (
                      <>
                        <div className="dungeons-page__dweller-names">
                          {room.dwellers.monsters.map((m, i) => (
                            <button
                              key={`${m.id}-${i}`}
                              type="button"
                              className="dungeons-page__dweller"
                              onClick={() => setDwellerId(m.id)}
                            >
                              {m.name}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="dungeons-page__fight"
                          disabled={noCharacters}
                          onClick={() => raiseCombat(room)}
                        >
                          Поднять бой
                        </button>
                        {raisedIn === room.number && (
                          <span className="dungeons-page__placed">
                            Бой начат — откройте вкладку «Бой»
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
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
  const { numbers, error: loadError } = useTrapNumbers();
  const [bestiary, setBestiary] = useState<MonsterTemplate[] | null>(null);
  const [level, setLevel] = useState(startLevel);
  const [danger, setDanger] = useState<TrapDanger>("Опасная");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
    return <DungeonView dungeon={open} bestiary={bestiary ?? []} onClose={() => setOpenId(null)} />;
  }

  async function create() {
    if (!numbers || !bestiary) return;
    setError(null);
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const plan = generateDungeon({ seed, partyLevel: level, danger, numbers, bestiary });
      const record: DungeonRecord = {
        id: crypto.randomUUID(),
        name: lineTitle(plan.purpose.text),
        createdAt: new Date().toISOString(),
        seed,
        partyLevel: level,
        danger,
        plan,
        statuses: {},
      };
      await setDungeons((list) => [...list, record]);
      setOpenId(record.id);
    } catch (e) {
      setError(String(e));
    }
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
                  отряд {d.partyLevel} ур. · {d.danger} · {new Date(d.createdAt).toLocaleDateString("ru-RU")}
                </span>
              </span>
              {confirmId === d.id ? (
                <span className="dungeons-page__confirm">
                  Удалить «{d.name}»?
                  <button type="button" onClick={() => remove(d.id)}>Да, удалить</button>
                  <button type="button" onClick={() => setConfirmId(null)}>Нет</button>
                </span>
              ) : (
                <span className="dungeons-page__row-actions">
                  <button type="button" onClick={() => setOpenId(d.id)}>Открыть</button>
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
            Пять слоёв из таблиц ловушек и числа SRD под уровень отряда и опасность
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
