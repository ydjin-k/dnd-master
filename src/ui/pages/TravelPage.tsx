import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCampaign } from "../../state/CampaignContext";
import { useDiceLog } from "../../state/DiceLogContext";
import type { Character, RollResult, TravelPaceId, TravelState } from "../../state/types";
import { abilityMod, proficiencyBonusForLevel } from "../characterCreationData";
import { exhaustionLevelName, exhaustionLevelOf, withExhaustionRaised } from "../exhaustion";
import {
  FOOD_EXHAUSTION_HINT,
  daysWithoutFood,
  daysWithoutFoodLimit,
  resolveFoodDay,
  resolveWaterDay,
  waterGallonsNeeded,
  type Ration,
  type WaterShare,
} from "../foodAndWater";
import { FORAGE_SKILL, FORAGE_YIELD_DIE, FORAGE_ZONES, forageOutcome, forageZoneById } from "../foraging";
import {
  TRAVEL_HOURS_PER_DAY,
  TRAVEL_PACES,
  effectivePace,
  forcedMarchDc,
  formatMiles,
  paceById,
  travelDays,
  travelOf,
  travelledMiles,
  withDayMarched,
  withDifficultTerrain,
  withHalvedDay,
  withHourMarched,
  withLostDay,
  withPace,
} from "../travelPace";
import "./TravelPage.css";

/**
 * Странствие: темп отряда и счётчик пути. Живёт на «Приключениях» рядом с
 * генератором событий намеренно — там бросают те девять строк «Столкновений
 * местности Подземья», которые режут темп, и наказание должно быть под рукой у
 * того же стола.
 *
 * Экран НЕ владеет ни одним правилом. Числа темпа и мили — `travelPace.ts`,
 * голод и жажда — `foodAndWater.ts`, сбор еды — `foraging.ts` (наше правило),
 * истощение — `exhaustion.ts`. Здесь только показ, кнопки и кость, которую
 * бросает движок (`roll_dice`): своего `Math.random` на экране нет.
 *
 * Машиночитаемых эффектов у строк таблиц событий не завелось: мастер читает
 * строку и жмёт кнопку сам (решение владельца 17.09.2026).
 */
export function TravelPage({ onBack }: { onBack: () => void }) {
  const { state, setTravel, updateCharacter } = useCampaign();
  const { recordRoll } = useDiceLog();
  const travel = travelOf(state.travel);
  const pace = effectivePace(travel.pace, travel.difficultTerrain);
  const paceRow = paceById(travel.pace);

  /**
   * Час, за который отряд ещё не отчитался спасбросками. Держится до закрытия
   * дня или до следующего часа: за столом бросают по очереди, и панель не должна
   * исчезать после первого броска.
   */
  const [forcedMarchHour, setForcedMarchHour] = useState<number | null>(null);
  /** Что выпало каждому на этом часу — подпись у его строки. */
  const [marchRolls, setMarchRolls] = useState<Record<string, { total: number; failed: boolean }>>({});
  const [error, setError] = useState<string | null>(null);
  /** Жара — выбор дня, а не модель погоды: погоду карточка трогать запрещает. */
  const [hot, setHot] = useState(false);
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});
  const [zoneId, setZoneId] = useState(FORAGE_ZONES[1].id);
  const [foragerId, setForagerId] = useState<string>("");
  const [forageNote, setForageNote] = useState<string | null>(null);

  const dc = forcedMarchHour === null ? null : forcedMarchDc(forcedMarchHour);
  const forager = state.characters.find((c) => c.id === foragerId) ?? state.characters[0];
  const zone = forageZoneById(zoneId);

  /** Бросок кости движком с записью в журнал бросков — как на листе персонажа. */
  async function roll(label: string, expression: string): Promise<RollResult | null> {
    try {
      const result = await invoke<RollResult>("roll_dice", { expression });
      recordRoll(label, result);
      setError(null);
      return result;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }

  function saveBonus(c: Character): number {
    const proficient = c.savingThrowProficiencies.includes("Телосложение");
    return abilityMod(c.abilities.constitution) + (proficient ? proficiencyBonusForLevel(c.level) : 0);
  }

  function expressionWith(bonus: number): string {
    return bonus === 0 ? "1d20" : `1d20${bonus > 0 ? "+" : ""}${bonus}`;
  }

  /**
   * Прошли час. Запись идёт УПДЕЙТЕРОМ от свежего счётчика, а не от снимка
   * рендера: иначе два нажатия подряд, сделанные до перерисовки, дали бы один
   * час вместо двух. Номер часа для панели берётся из того же `withHourMarched`,
   * применённого к снимку, — показать его больше нечем, а разъехаться со
   * счётчиком он может только при двух нажатиях в одном кадре, когда панель всё
   * равно перерисуется следующим.
   */
  async function marchHour() {
    const { hourOfDay } = withHourMarched(travel);
    await setTravel((current) => withHourMarched(current).travel);
    setForcedMarchHour(forcedMarchDc(hourOfDay) !== null ? hourOfDay : null);
    setMarchRolls({});
  }

  /**
   * Любая кнопка, закрывающая день, гасит панель форсированного марша: часы
   * сегодняшнего перехода обнулились, и спасброски прошлого дня к новому
   * отношения не имеют.
   */
  function closeDay(apply: (current: TravelState) => TravelState) {
    setForcedMarchHour(null);
    setMarchRolls({});
    return setTravel(apply);
  }

  /**
   * Спасбросок форсированного марша. Провал поднимает истощение НА ЛИСТЕ, тем же
   * механизмом состояний, которым его ставят руками, — второго счёта истощения
   * здесь нет. Уровень считается ВНУТРИ updater'а, от свежего персонажа: два
   * провала подряд иначе сложились бы в один уровень.
   */
  async function rollForcedMarch(c: Character) {
    if (dc === null) return;
    const result = await roll(`Форсированный марш, ${c.name} (СЛ ${dc})`, expressionWith(saveBonus(c)));
    if (!result) return;
    const failed = result.total < dc;
    setMarchRolls((prev) => ({ ...prev, [c.id]: { total: result.total, failed } }));
    if (failed) {
      await updateCharacter(c.id, (ch) => ({ ...ch, conditions: withExhaustionRaised(ch.conditions) }));
    }
  }

  /**
   * День еды: счётчик голода и, за пределом, степень истощения без броска.
   *
   * Правило считается ВНУТРИ updater'а, от свежего персонажа: два дня голода,
   * отмеченные до перерисовки, обязаны сложиться в два, а не затереть друг
   * друга. Снимок рендера остаётся только подписи — она рассказывает о нажатии,
   * а не владеет счётом.
   */
  async function applyRation(c: Character, ration: Ration) {
    await updateCharacter(c.id, (ch) => {
      const fresh = resolveFoodDay(ch.halfDaysWithoutFood, ch.abilities.constitution, ration);
      return {
        ...ch,
        halfDaysWithoutFood: fresh.halfDaysWithoutFood,
        conditions: fresh.degrees > 0 ? withExhaustionRaised(ch.conditions, fresh.degrees) : ch.conditions,
      };
    });
    setDayNotes((prev) => ({
      ...prev,
      [c.id]: resolveFoodDay(c.halfDaysWithoutFood, c.abilities.constitution, ration).reason,
    }));
  }

  /**
   * День воды. Половина нормы требует спасброска СЛ 15 — его бросает кость, а не
   * экран; меньше половины даёт истощение без броска. Сколько степеней, решает
   * `foodAndWater.ts` по уже имеющемуся истощению.
   */
  async function applyWater(c: Character, share: WaterShare) {
    const outcome = resolveWaterDay(c.conditions, share, hot);
    if (!outcome) {
      setDayNotes((prev) => ({ ...prev, [c.id]: `Норма воды выпита (${waterGallonsNeeded(hot)} гал.)` }));
      return;
    }
    /**
     * Сколько степеней даёт эта беда, зависит от УЖЕ имеющегося истощения
     * (`[3]/blocks[32]`), поэтому решает это свежий персонаж внутри updater'а, а
     * не снимок рендера: первая беда дня меняет ответ на вторую. СЛ от состояний
     * не зависит и потому берётся сразу — бросить надо до записи.
     */
    const raise = () =>
      updateCharacter(c.id, (ch) => {
        const fresh = resolveWaterDay(ch.conditions, share, hot);
        return fresh === null ? ch : { ...ch, conditions: withExhaustionRaised(ch.conditions, fresh.degrees) };
      });
    if (outcome.saveDc !== null) {
      const result = await roll(`Жажда, ${c.name} (СЛ ${outcome.saveDc})`, expressionWith(saveBonus(c)));
      if (!result) return;
      const failed = result.total < outcome.saveDc;
      if (failed) await raise();
      setDayNotes((prev) => ({
        ...prev,
        [c.id]: `Спасбросок ${result.total} против СЛ ${outcome.saveDc} — ${
          failed ? `истощение +${outcome.degrees}` : "обошлось"
        }`,
      }));
      return;
    }
    await raise();
    setDayNotes((prev) => ({ ...prev, [c.id]: outcome.reason }));
  }

  /** Сбор еды — наше правило: проверка Мудрости (Выживание) против Сложности зоны. */
  async function forage() {
    if (!forager) return;
    const proficient = forager.skillProficiencies.includes(FORAGE_SKILL);
    const wisMod = abilityMod(forager.abilities.wisdom);
    const bonus = wisMod + (proficient ? proficiencyBonusForLevel(forager.level) : 0);
    const check = await roll(`${FORAGE_SKILL}, ${forager.name} (Сложность ${zone.dc})`, expressionWith(bonus));
    if (!check) return;
    const yielded = await roll(`Собрано, ${forager.name}`, `1d${FORAGE_YIELD_DIE}`);
    if (!yielded) return;
    setForageNote(forageOutcome(check.total, zone.dc, yielded.total, wisMod).reason);
  }

  return (
    <section className="adventures-page travel-page">
      <div className="adventures-page__head">
        <button type="button" className="adventures-page__back" onClick={onBack}>
          ← Приключения
        </button>
        <h2>Странствие</h2>
      </div>

      <section className="travel-page__block">
        <h3>Темп перемещения</h3>
        <div className="travel-page__paces">
          {TRAVEL_PACES.map((row) => {
            const shown = effectivePace(row.id, travel.difficultTerrain);
            return (
              <label key={row.id} className="travel-page__pace">
                <input
                  type="radio"
                  name="travel-pace"
                  value={row.id}
                  checked={travel.pace === row.id}
                  onChange={() => setTravel((current) => withPace(current, row.id as TravelPaceId))}
                />
                <span className="travel-page__pace-name">{row.name}</span>
                <span className="travel-page__pace-numbers">
                  {shown.feetPerMinute} фт/мин · {formatMiles(shown.milesPerHour)} мили/час ·{" "}
                  {formatMiles(shown.milesPerDay)} миль/день
                </span>
                <span className="travel-page__pace-effect">{row.effect}</span>
              </label>
            );
          })}
        </div>
        <label className="travel-page__terrain">
          <input
            type="checkbox"
            checked={travel.difficultTerrain}
            onChange={(e) => setTravel((current) => withDifficultTerrain(current, e.currentTarget.checked))}
          />
          Идём по труднопроходимой местности — расстояние вдвое меньше
        </label>
        <p className="travel-page__hint">
          Таблица предполагает {TRAVEL_HOURS_PER_DAY} часов перехода в день. Быстрый темп роняет пассивную
          внимательность на листе персонажа, замедление позволяет красться.
        </p>
      </section>

      <section className="travel-page__block">
        <h3>Счётчик пути</h3>
        <dl className="travel-page__counters">
          <div className="travel-page__counter">
            <dt>Дней пути</dt>
            <dd>{travelDays(travel)}</dd>
          </div>
          <div className="travel-page__counter">
            <dt>Часов сегодня</dt>
            <dd>{travel.hoursToday}</dd>
          </div>
          <div className="travel-page__counter">
            <dt>Пройдено миль</dt>
            <dd>{formatMiles(travelledMiles(travel))}</dd>
          </div>
        </dl>
        <div className="travel-page__buttons">
          <button type="button" onClick={marchHour}>
            Прошли час
          </button>
          <button type="button" onClick={() => closeDay(withDayMarched)}>
            Прошли день
          </button>
          <button type="button" onClick={() => closeDay(withHalvedDay)}>
            Темп вдвое
          </button>
          <button type="button" onClick={() => closeDay(withLostDay)}>
            Потерян день
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Начать новый путь? Дни, часы и мили обнулятся.")) {
                closeDay((current) => ({ ...current, hoursToday: 0, dayMarches: 0, halfDayMarches: 0, lostDays: 0 }));
              }
            }}
          >
            Новый путь
          </button>
        </div>
        <p className="travel-page__hint">
          Мили считаются из темпа и часов: {paceRow.name.toLowerCase()} темп даёт{" "}
          {formatMiles(pace.milesPerHour)} мили в час и {formatMiles(pace.milesPerDay)} за дневной переход.
          «Темп вдвое» — половина дневного перехода, «потерян день» — время без расстояния. Поменяете темп или
          местность — счётчик пересчитает пройденное: пройденного числом он не хранит.
        </p>
      </section>

      {forcedMarchHour !== null && dc !== null && (
        <section className="travel-page__block travel-page__block--march">
          <h3>
            Форсированный марш: {forcedMarchHour}-й час — спасбросок Телосложения УС {dc}
          </h3>
          <p className="travel-page__hint">
            УС растёт на 1 за каждый час сверх {TRAVEL_HOURS_PER_DAY}. Провал — одна степень истощения на листе.
          </p>
          {state.characters.length === 0 && <p className="travel-page__hint">Бросать некому: в кампании нет персонажей.</p>}
          <ul className="travel-page__people">
            {state.characters.map((c) => {
              const rolled = marchRolls[c.id];
              return (
                <li key={c.id} className="travel-page__person">
                  <span className="travel-page__person-name">{c.name}</span>
                  <button type="button" onClick={() => rollForcedMarch(c)}>
                    Спасбросок
                  </button>
                  {rolled && (
                    <span className="travel-page__person-note">
                      {rolled.total} против УС {dc} —{" "}
                      {rolled.failed ? `провал, ${exhaustionLevelName(exhaustionLevelOf(c.conditions))}` : "успех"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="travel-page__block">
        <h3>Привал: еда и вода</h3>
        <label className="travel-page__terrain">
          <input type="checkbox" checked={hot} onChange={(e) => setHot(e.currentTarget.checked)} />
          Жаркая погода — норма воды два галлона
        </label>
        {state.characters.length === 0 && <p className="travel-page__hint">Кормить некого: в кампании нет персонажей.</p>}
        <ul className="travel-page__people">
          {state.characters.map((c) => {
            const limit = daysWithoutFoodLimit(c.abilities.constitution);
            return (
              <li key={c.id} className="travel-page__person travel-page__person--day">
                <span className="travel-page__person-name">{c.name}</span>
                <span className="travel-page__person-note">
                  без еды {daysWithoutFood(c.halfDaysWithoutFood)} дн. из {limit}
                </span>
                <span className="travel-page__person-actions">
                  <button type="button" onClick={() => applyRation(c, "full")}>
                    Полный рацион
                  </button>
                  <button type="button" onClick={() => applyRation(c, "half")}>
                    Полрациона
                  </button>
                  <button type="button" onClick={() => applyRation(c, "none")}>
                    Не ел
                  </button>
                </span>
                <span className="travel-page__person-actions">
                  <button type="button" onClick={() => applyWater(c, "full")}>
                    Норма воды
                  </button>
                  <button type="button" onClick={() => applyWater(c, "half")}>
                    Полнормы
                  </button>
                  <button type="button" onClick={() => applyWater(c, "less")}>
                    Меньше
                  </button>
                </span>
                {dayNotes[c.id] && <span className="travel-page__person-note">{dayNotes[c.id]}</span>}
              </li>
            );
          })}
        </ul>
        <p className="travel-page__hint">{FOOD_EXHAUSTION_HINT}</p>
      </section>

      <section className="travel-page__block">
        <h3>Сбор еды</h3>
        <p className="travel-page__hint">
          Наше правило, не SRD: проверка Мудрости ({FORAGE_SKILL}) против Сложности зоны, при успехе 1к
          {FORAGE_YIELD_DIE} + модификатор Мудрости фунтов еды и столько же галлонов воды. Фунт еды и галлон
          воды — суточная норма одного персонажа.
        </p>
        <div className="travel-page__forage">
          <label>
            Изобилие зоны
            <select aria-label="Изобилие зоны" value={zoneId} onChange={(e) => setZoneId(e.currentTarget.value as typeof zoneId)}>
              {FORAGE_ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} — Сложность {z.dc}
                </option>
              ))}
            </select>
          </label>
          <label>
            Собирает
            <select
              aria-label="Кто собирает"
              value={forager?.id ?? ""}
              onChange={(e) => setForagerId(e.currentTarget.value)}
            >
              {state.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={forage} disabled={!forager}>
            Бросить проверку
          </button>
        </div>
        <p className="travel-page__hint">{zone.note}</p>
        {forageNote && <p className="travel-page__forage-note">{forageNote}</p>}
        {!forager && <p className="travel-page__hint">Собирать некому: в кампании нет персонажей.</p>}
      </section>

      {error && <p className="adventures-page__error">{error}</p>}
    </section>
  );
}
