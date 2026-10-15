import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import { useDiceLog } from "../../state/DiceLogContext";
import type { Combatant, MonsterTemplate, RollResult } from "../../state/types";
import { fmtMod } from "../characterCreationData";
import {
  combatantDeathSaves,
  combatantLabel,
  fallenFlags,
  hasActed,
  initiativeModifierOf,
  initiativeTotal,
  isFallen,
  rollsDeathSaves,
  searchMonsters,
  turnOrder,
} from "../combatTracker";
import {
  DEATH_SAVE_EXPRESSION,
  DEATH_SAVE_FAILURES_TO_DEATH,
  DEATH_SAVE_STATE_LABELS,
  DEATH_SAVE_SUCCESSES_TO_STABLE,
  applyDeathSaveRoll,
  deathSaveRollLabel,
  deathSaveState,
  deathSaveVerdict,
  deathSavesOf,
} from "../deathSaves";
import { UIIcon } from "../UIIcon";
import "./CombatPage.css";

/**
 * Раздел «Бой» — трекер: добавить участников, бросить инициативу, вести
 * указатель по линии и считать хиты. Ничего сверх этого (решение владельца
 * 09.10.2026): атаки, урон, заклинания и перемещение разрешает Мастер за
 * столом. Всё, что здесь выводится из боя, — в `combatTracker.ts`.
 */
export function CombatPage() {
  const {
    state,
    addToCombat,
    rollInitiative,
    nextTurn,
    setPlayerRules,
    setCombatantDeathSaves,
    updateCharacter,
    applyDamage,
    removeFromCombat,
    transferHpToSheets,
    endCombat,
  } = useCampaign();
  const { recordRoll } = useDiceLog();
  const combat = state.combat;
  const [bestiary, setBestiary] = useState<MonsterTemplate[]>([]);
  const [bestiaryError, setBestiaryError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /** Сколько существ этого вида добавить — по id шаблона; по умолчанию 1. */
  const [counts, setCounts] = useState<Record<string, string>>({});
  /** На сколько хитов сдвинуть — по id бойца. */
  const [hpAmounts, setHpAmounts] = useState<Record<string, string>>({});
  /** «Закончить бой» спрашивает подтверждение: бой стирается целиком. */
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  /** Последний спасбросок от смерти — по id бойца: выпавшее число для подписи «успех / провал». */
  const [lastDeathSave, setLastDeathSave] = useState<Record<string, number>>({});
  const [deathSaveError, setDeathSaveError] = useState<string | null>(null);
  /** Кто сейчас бросает: второй щелчок до ответа движка не должен сложиться с первым. */
  const deathSaveRolling = useRef(new Set<string>());

  useEffect(() => {
    invoke<MonsterTemplate[] | null>("get_bestiary")
      .then((loaded) => setBestiary(loaded ?? []))
      .catch((e) => setBestiaryError(String(e)));
  }, []);

  const found = useMemo(() => searchMonsters(bestiary, search), [bestiary, search]);
  const order = combat ? turnOrder(combat, state.characters, bestiary) : [];
  const inCombat = new Set(
    combat?.combatants.flatMap((c) =>
      c.source.kind === "character" ? [c.source.characterId] : [],
    ) ?? [],
  );

  const modifiers: Record<string, number> = {};
  let everyModifierKnown = order.length > 0;
  for (const c of order) {
    const mod = initiativeModifierOf(c, state.characters, bestiary);
    if (mod === null) everyModifierKnown = false;
    else modifiers[c.id] = mod;
  }

  /** Персонажи, чьи боевые хиты расходятся с листом, — их потеряет конец боя без переноса. */
  const notTransferred =
    combat?.combatants.flatMap((c) => {
      if (c.source.kind !== "character") return [];
      const characterId = c.source.characterId;
      const sheet = state.characters.find((ch) => ch.id === characterId);
      return sheet && sheet.currentHp !== c.currentHp ? [sheet.name] : [];
    }) ?? [];

  /**
   * Спасбросок от смерти из строки трекера — тем же правилом, что на листе:
   * кость бросает движок (`roll_dice`), чем обернулось — решает
   * `applyDeathSaveRoll`, второй копии правила здесь нет.
   *
   * Счёт персонажа пишется в ЕГО ЛИСТ и считается внутри updater'а от свежего
   * персонажа (как у кнопки на листе), счёт существа — в бойца. «20» даёт хит
   * БОЕВОМУ бойцу той же командой хитов, что и кнопки «−/+»: хиты листа трекер
   * не трогает (перенос — только кнопкой).
   */
  async function rollDeathSave(c: Combatant, label: string) {
    if (deathSaveRolling.current.has(c.id)) return;
    deathSaveRolling.current.add(c.id);
    setDeathSaveError(null);
    try {
      const result = await invoke<RollResult>("roll_dice", { expression: DEATH_SAVE_EXPRESSION });
      recordRoll(deathSaveRollLabel(label), result);
      const roll = result.total;
      setLastDeathSave((prev) => ({ ...prev, [c.id]: roll }));

      let hp: number | null = null;
      const source = c.source;
      if (source.kind === "character") {
        await updateCharacter(source.characterId, (ch) => {
          const outcome = applyDeathSaveRoll(deathSavesOf(ch), roll);
          hp = outcome.hp;
          return {
            ...ch,
            deathSaveSuccesses: outcome.saves.successes,
            deathSaveFailures: outcome.saves.failures,
          };
        });
      } else {
        const saves = combatantDeathSaves(c, state.characters);
        if (!saves) return;
        const outcome = applyDeathSaveRoll(saves, roll);
        hp = outcome.hp;
        await setCombatantDeathSaves(c.id, outcome.saves);
      }
      if (hp !== null) await applyDamage(c.id, c.currentHp - hp);
    } catch (e) {
      setDeathSaveError(String(e));
    } finally {
      deathSaveRolling.current.delete(c.id);
    }
  }

  function countOf(templateId: string): number {
    const n = Math.floor(Number(counts[templateId] ?? "1"));
    return Number.isFinite(n) && n >= 1 ? n : 0;
  }

  function addMonsters(templateId: string) {
    const n = countOf(templateId);
    if (n < 1) return;
    addToCombat(Array.from({ length: n }, () => templateId), []);
  }

  function hpAmountOf(id: string): number {
    const n = Math.floor(Number(hpAmounts[id] ?? ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  return (
    <div className="combat-page">
      <div className="combat-page__head dm-card-head">
        <UIIcon name="combat" />
        <h2>Бой</h2>
        {combat && (
          <span className="combat-page__round dm-pill dm-pill--progress">Раунд {combat.round}</span>
        )}
      </div>

      <div className="combat-page__layout">
        <section className="combat-add" aria-label="Добавить в бой">
          <h3>Персонажи</h3>
          <ul className="combat-add__list">
            {state.characters.map((c) => (
              <li key={c.id} className="combat-add__row">
                <span className="combat-add__name">{c.name}</span>
                <span className="combat-add__meta">
                  {c.currentHp}/{c.maxHp} хитов
                </span>
                <button
                  type="button"
                  disabled={inCombat.has(c.id)}
                  onClick={() => addToCombat([], [c.id])}
                >
                  {inCombat.has(c.id) ? "В бою" : "Добавить"}
                </button>
              </li>
            ))}
          </ul>
          {state.characters.length === 0 && (
            <p className="combat-add__empty">Персонажей нет — добавь их на вкладке «Персонажи».</p>
          )}

          <h3>Существа</h3>
          <input
            type="text"
            className="combat-add__search dm-field--search"
            placeholder="Поиск по бестиарию..."
            aria-label="Поиск существ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {bestiaryError && (
            <p className="combat-page__error">Не удалось загрузить бестиарий: {bestiaryError}</p>
          )}
          {search.trim() !== "" && found.length === 0 && (
            <p className="combat-add__empty">Никого не нашлось.</p>
          )}
          <ul className="combat-add__list combat-add__found">
            {found.map((m) => (
              <li key={m.id} className="combat-add__row">
                <span className="combat-add__name">{m.name}</span>
                <span className="combat-add__meta">
                  КД {m.armorClass}, {m.maxHp} хитов
                </span>
                <input
                  type="number"
                  min={1}
                  className="combat-add__count"
                  aria-label={`Сколько: ${m.name}`}
                  value={counts[m.id] ?? "1"}
                  onChange={(e) => setCounts({ ...counts, [m.id]: e.target.value })}
                />
                <button
                  type="button"
                  disabled={countOf(m.id) < 1}
                  onClick={() => addMonsters(m.id)}
                >
                  Добавить
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="combat-line" aria-label="Порядок ходов">
          {!combat ? (
            <p className="combat-line__empty">Боя нет — добавь персонажей и существ.</p>
          ) : (
            <>
              <div className="combat-line__controls">
                <button
                  type="button"
                  className="dm-button--primary"
                  disabled={!everyModifierKnown}
                  onClick={() => rollInitiative(modifiers)}
                >
                  Рассчитать инициативу
                </button>
                <button
                  type="button"
                  disabled={order.length === 0 || order.every(isFallen)}
                  title={order.length > 0 && order.every(isFallen) ? "Все пали — ходить некому" : undefined}
                  onClick={() => nextTurn(fallenFlags(order))}
                >
                  Следующий
                </button>
              </div>
              {deathSaveError && (
                <p className="combat-page__error">Спасбросок не удался: {deathSaveError}</p>
              )}

              <ol className="combat-line__list">
                {order.map((c, position) => {
                  const label = combatantLabel(c, combat, state.characters, bestiary);
                  const current = position === combat.currentTurnIndex;
                  const acted = hasActed(combat, position);
                  const amount = hpAmountOf(c.id);
                  const fallen = isFallen(c);
                  const saves = rollsDeathSaves(c) ? combatantDeathSaves(c, state.characters) : null;
                  const savesState = saves ? deathSaveState(saves) : null;
                  const lastRoll = lastDeathSave[c.id];
                  return (
                    <li
                      key={c.id}
                      className={
                        "combat-line__row" +
                        (current ? " combat-line__row--current" : "") +
                        (acted ? " combat-line__row--acted" : "") +
                        (c.currentHp <= 0 ? " combat-line__row--down" : "")
                      }
                      aria-current={current ? "step" : undefined}
                      data-testid="combat-row"
                    >
                      <span className="combat-line__pointer" aria-hidden="true">
                        {current ? "▶" : ""}
                      </span>
                      <span className="combat-line__name">{label}</span>
                      <span className="combat-line__initiative">
                        <span className="combat-line__initiative-label">Инициатива</span>{" "}
                        {c.initiativeRoll ? (
                          <>
                            <strong>{initiativeTotal(c.initiativeRoll)}</strong>{" "}
                            <span className="combat-line__roll">
                              (к20: {c.initiativeRoll.d20} {fmtMod(c.initiativeRoll.dexModifier)})
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                      <span className="combat-line__hp">
                        {c.currentHp}/{c.maxHp}
                      </span>
                      <span className="combat-line__acted">
                        {fallen ? "пал" : current ? "его ход" : acted ? "походил" : ""}
                      </span>
                      <div className="combat-line__details">
                        {saves && savesState && (
                          <span className="combat-line__death-saves" aria-label={`Спасброски от смерти: ${label}`}>
                            <span className="combat-line__death-count">
                              Успехи {saves.successes}/{DEATH_SAVE_SUCCESSES_TO_STABLE} · Провалы{" "}
                              {saves.failures}/{DEATH_SAVE_FAILURES_TO_DEATH}
                            </span>
                            {savesState === "rolling" ? (
                              <button
                                type="button"
                                aria-label={`Спасбросок от смерти: ${label}`}
                                onClick={() => rollDeathSave(c, label)}
                              >
                                Бросить к20
                              </button>
                            ) : (
                              <span className="combat-line__death-state">{DEATH_SAVE_STATE_LABELS[savesState]}</span>
                            )}
                            {lastRoll !== undefined && (
                              <span className="combat-line__death-last">
                                Выпало {lastRoll} — {deathSaveVerdict(lastRoll)}
                              </span>
                            )}
                          </span>
                        )}
                        {c.source.kind === "monster" && (
                          <label
                            className="combat-line__player-rules"
                            title="На 0 хитов существо бросает спасброски от смерти, а не погибает сразу"
                          >
                            <input
                              type="checkbox"
                              checked={c.playerRules}
                              onChange={(e) => setPlayerRules(c.id, e.target.checked)}
                            />
                            Спасброски от смерти как у персонажа
                          </label>
                        )}
                        <span className="combat-line__hp-controls">
                          <input
                            type="number"
                            min={1}
                            className="combat-line__hp-amount"
                            aria-label={`Хиты: ${label}`}
                            value={hpAmounts[c.id] ?? ""}
                            onChange={(e) => setHpAmounts({ ...hpAmounts, [c.id]: e.target.value })}
                          />
                          <button
                            type="button"
                            aria-label={`Отнять хиты: ${label}`}
                            disabled={amount === 0}
                            onClick={() => applyDamage(c.id, amount)}
                          >
                            −
                          </button>
                          <button
                            type="button"
                            aria-label={`Вернуть хиты: ${label}`}
                            disabled={amount === 0}
                            onClick={() => applyDamage(c.id, -amount)}
                          >
                            +
                          </button>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="combat-line__remove"
                        aria-label={`Убрать из боя: ${label}`}
                        title="Убрать из боя"
                        onClick={() => removeFromCombat(c.id, position)}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="combat-line__controls">
                <button
                  type="button"
                  disabled={inCombat.size === 0}
                  onClick={() => transferHpToSheets()}
                >
                  Перенести хиты в листы
                </button>
                {!confirmingEnd && (
                  <button type="button" onClick={() => setConfirmingEnd(true)}>
                    Закончить бой
                  </button>
                )}
              </div>
              {confirmingEnd && (
                <div className="combat-line__confirm" role="alertdialog" aria-label="Закончить бой?">
                  <p>
                    Закончить бой? Линия, броски и хиты существ пропадут.
                    {notTransferred.length > 0 &&
                      ` Хиты не перенесены в листы: ${notTransferred.join(", ")}.`}
                  </p>
                  <button
                    type="button"
                    className="combat-line__confirm-yes"
                    onClick={() => {
                      setConfirmingEnd(false);
                      endCombat();
                    }}
                  >
                    Да, закончить
                  </button>
                  <button type="button" onClick={() => setConfirmingEnd(false)}>
                    Отмена
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
