import type { Character, RuleTopic } from "../state/types";

/**
 * Правило нуля хитов на листе персонажа — спасброски от смерти.
 *
 * **Почему отдельный файл, а не обработчик нажатия в CharactersPage.tsx.**
 * Решение «успех / провал / два провала на единице / 1 хит на двадцатке»
 * обязано иметь ОДНОГО владельца, потому что путей к нему больше одного:
 * кнопка броска на листе, галочки, которые игрок ставит руками после настоящей
 * кости за столом, и любой следующий путь, который появится. Родившись в
 * обработчике нажатия, правило покрывало бы только его — ровно тем дефектом,
 * который однажды уже стоил строки журнала, рождённой в обработчике и не
 * увидевшей второго пути применения. Здесь же оно — чистая функция от числа на
 * кости и текущих счётчиков, и проверяется без React и без движка.
 *
 * **Что здесь SRD, а что наше.** Все числа — SRD 5.1, раздел
 * `combat-damage-and-healing` в `src-tauri/rules/rules.json` (подразделы
 * «Спасброски от смерти», «Стабилизация существа», «Чудовища и смерть»), и
 * каждое стоит здесь ровно один раз: подсказка на листе собирается из этих же
 * констант, а не пишет цифры второй раз словами. Дословного текста SRD тут нет
 * — формулировки подсказки наши, потому что в справочнике это абзацы, а игроку
 * на нуле хитов нужен короткий список. Проба `deathSaves.test.ts` сверяет
 * каждое число с абзацем `rules.json`, чтобы «числа из SRD» было проверяемым
 * утверждением, а не обещанием.
 */

/** Раздел SRD, из которого взяты все числа этого файла. Единственный адрес. */
export const DEATH_SAVE_TOPIC_ID = "combat-damage-and-healing";

/** Выражение для `roll_dice`: спасбросок от смерти ни к какой характеристике не привязан, поэтому модификатора нет. */
export const DEATH_SAVE_EXPRESSION = "1d20";

/** «Бросьте к20. Если результат будет «10» или выше, вы преуспели.» */
export const DEATH_SAVE_DC = 10;

/** «В случае трёх успехов вы становитесь стабилизированным.» */
export const DEATH_SAVE_SUCCESSES_TO_STABLE = 3;

/** «В случае трёх провалов вы умираете.» */
export const DEATH_SAVE_FAILURES_TO_DEATH = 3;

/** «Если... выпадает «1», это считается двумя провалами.» */
export const DEATH_SAVE_CRIT_FAIL_ROLL = 1;
export const DEATH_SAVE_CRIT_FAIL_COST = 2;

/** «Если выпадет «20», вы восстанавливаете 1 хит.» */
export const DEATH_SAVE_CRIT_SUCCESS_ROLL = 20;
export const DEATH_SAVE_CRIT_SUCCESS_HP = 1;

/** «...проверку Мудрости (Медицина) с УС 10» — стабилизация чужим действием. */
export const STABILIZE_MEDICINE_DC = 10;

/**
 * Предел любого из двух счётчиков. Оба порога SRD равны трём, и предел взят
 * максимумом из них, а не третьей константой: разойдись они когда-нибудь,
 * счётчик не обрежется раньше своего порога.
 */
export const DEATH_SAVE_MAX_COUNT = Math.max(DEATH_SAVE_SUCCESSES_TO_STABLE, DEATH_SAVE_FAILURES_TO_DEATH);

/**
 * Подсказка под полем хитов — пересказ, а не выдержка. Числа подставляются из
 * констант выше, поэтому разойтись с правилом строки не могут: чтобы соврать
 * игроку, придётся сначала поменять само правило.
 *
 * Состояние «Без сознания» названо по имени из приложения А (те же имена лежат
 * в `CONDITIONS`), но его текст сюда не переписан: он приходит из
 * `appendices-conditions` тем же путём, что и у остальных состояний листа.
 */
export const deathSaveHintLines: readonly string[] = [
  "Вы без сознания и не можете ни действовать, ни говорить — состояние «Без сознания» (приложение А).",
  `В начале каждого своего хода бросайте спасбросок от смерти: к${DEATH_SAVE_CRIT_SUCCESS_ROLL}, ${DEATH_SAVE_DC} и выше — успех, меньше — провал. Характеристика в нём не участвует.`,
  `${DEATH_SAVE_SUCCESSES_TO_STABLE} успеха — вы стабилизированы, ${DEATH_SAVE_FAILURES_TO_DEATH} провала — смерть. Считаются оба счёта, подряд им быть не обязательно. «${DEATH_SAVE_CRIT_FAIL_ROLL}» на кости стоит ${DEATH_SAVE_CRIT_FAIL_COST} провала, «${DEATH_SAVE_CRIT_SUCCESS_ROLL}» возвращает ${DEATH_SAVE_CRIT_SUCCESS_HP} хит и сознание.`,
  "Получили урон на 0 хитах — это проваленный спасбросок, а от критического попадания — два. Урона и мгновенной смерти от излишков приложение не знает: в лист урон не приходит вовсе, поэтому такой провал отмечайте галочкой сами.",
  `Любое лечение выше нуля возвращает вас в сознание. Без лечения сосед может действием и проверкой Мудрости (Медицина) с УС ${STABILIZE_MEDICINE_DC} стабилизировать вас: стабилизированный спасброски больше не бросает, но и в сознание не приходит.`,
  "Чудовищ Мастера это правило обычно не касается: на 0 хитах они просто умирают, без потери сознания и спасбросков.",
];

/** Куда идти за полным текстом правила. Перехода по клику нет: выбранный раздел — внутреннее состояние RulesPage. */
export const DEATH_SAVE_RULES_LINK = "Правила → Урон и лечение";

/**
 * Метка записи в журнале бросков. Имя персонажа обязательно: за столом по
 * журналу видно, чей это бросок, а листов в кампании несколько.
 *
 * Выражение в метке — не техническая утечка, а то, из чего журнал берёт
 * картинку кости (`dieSidesFromExpression` в DiceIcon.tsx читает именно
 * метку). Без него запись о спасброске оказалась бы единственной в журнале без
 * кости.
 */
export function deathSaveRollLabel(characterName: string): string {
  const name = characterName.trim();
  return `Спасбросок от смерти (${DEATH_SAVE_EXPRESSION})${name ? `: ${name}` : ""}`;
}

/** Счёт спасбросков: оба числа 0–3. Хранит их персонаж, считает этот файл. */
export interface DeathSaves {
  readonly successes: number;
  readonly failures: number;
}

/** Спасбросков ещё не было — и то же значение ставит любое лечение выше нуля. */
export const NO_DEATH_SAVES: DeathSaves = { successes: 0, failures: 0 };

/**
 * Что происходит с персонажем на нуле хитов прямо сейчас:
 * `rolling` — бросает спасброски, `stable` — стабилизирован тремя успехами,
 * `dead` — умер от трёх провалов. Владелец один: и кнопка (бросать ли), и
 * подпись в листе (какое слово показать) спрашивают отсюда, а не считают
 * «успехов === 3» каждая у себя.
 */
export type DeathSaveState = "rolling" | "stable" | "dead";

export function deathSaveState(saves: DeathSaves): DeathSaveState {
  if (clampDeathSaveCount(saves.failures) >= DEATH_SAVE_FAILURES_TO_DEATH) return "dead";
  if (clampDeathSaveCount(saves.successes) >= DEATH_SAVE_SUCCESSES_TO_STABLE) return "stable";
  return "rolling";
}

/**
 * Предел счётчика — 0..3, и он ЗДЕСЬ, а не в модели: ни TS, ни Rust про три
 * не знают, они только хранят число. Нечисло (испорченное сохранение,
 * отсутствующее поле у совсем старого файла) читается нулём, а не роняет лист,
 * — тем же правилом, что у `clampCurrentHp`.
 */
export function clampDeathSaveCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(DEATH_SAVE_MAX_COUNT, Math.trunc(value)));
}

/** Счёт персонажа как его понимает правило — с обрезкой до предела. */
export function deathSavesOf(character: Character): DeathSaves {
  return {
    successes: clampDeathSaveCount(character.deathSaveSuccesses),
    failures: clampDeathSaveCount(character.deathSaveFailures),
  };
}

/** Итог одного спасброска: новый счёт и хиты, которые правило ставит САМО (иначе `null`). */
export interface DeathSaveOutcome {
  readonly saves: DeathSaves;
  /**
   * Хиты по правилу, а не по вводу игрока — единственный случай, когда правило
   * спасбросков пишет хиты: «20» возвращает ровно 1 хит. В остальных случаях
   * `null`, и хиты остаются теми, что были.
   */
  readonly hp: number | null;
}

/**
 * Правило SRD одним куском — и это ЕДИНСТВЕННОЕ место, где решается, чем
 * обернулся бросок. Обработчик кнопки на листе только бросает кость движком и
 * отдаёт сюда выпавшее число; галочки, которые игрок ставит руками, меняют те
 * же два числа тем же пределом. Родившись в обработчике нажатия, правило
 * покрывало бы один путь из двух.
 *
 * Счёт считается от ПЕРЕДАННОГО `saves`, а не от снимка рендера: вызывающий
 * обязан взять его из свежего персонажа внутри updater'а, иначе два броска
 * подряд сложились бы в один (запись 136, то же семейство дефектов, что у
 * безумия).
 *
 * Стабилизированный и мёртвый не бросают вовсе — правило возвращает счёт без
 * изменений, даже если кнопку всё-таки нажали.
 */
export function applyDeathSaveRoll(saves: DeathSaves, roll: number): DeathSaveOutcome {
  const current: DeathSaves = {
    successes: clampDeathSaveCount(saves.successes),
    failures: clampDeathSaveCount(saves.failures),
  };
  if (deathSaveState(current) !== "rolling") return { saves: current, hp: null };

  // «20» проверяется до порога успеха, «1» — до порога провала: оба числа
  // подходят и под общее правило, но у SRD для них своё, и оно старше.
  if (roll === DEATH_SAVE_CRIT_SUCCESS_ROLL) {
    return { saves: NO_DEATH_SAVES, hp: DEATH_SAVE_CRIT_SUCCESS_HP };
  }
  if (roll === DEATH_SAVE_CRIT_FAIL_ROLL) {
    return { saves: { ...current, failures: clampDeathSaveCount(current.failures + DEATH_SAVE_CRIT_FAIL_COST) }, hp: null };
  }
  if (roll >= DEATH_SAVE_DC) {
    return { saves: { ...current, successes: clampDeathSaveCount(current.successes + 1) }, hp: null };
  }
  return { saves: { ...current, failures: clampDeathSaveCount(current.failures + 1) }, hp: null };
}

/**
 * Чем обернулся бросок — словами для игрока. Функция от ОДНОЙ кости и ничего
 * больше: счёт показывают галочки, а состояние («стабилизирован», «мёртв») —
 * подпись, собранная из самого персонажа. Поэтому строка не зависит от снимка
 * рендера и не может разойтись с тем, что записано.
 */
export function deathSaveVerdict(roll: number): string {
  if (roll === DEATH_SAVE_CRIT_SUCCESS_ROLL) {
    return `«${DEATH_SAVE_CRIT_SUCCESS_ROLL}» — ${DEATH_SAVE_CRIT_SUCCESS_HP} хит и сознание, счёт очищен`;
  }
  if (roll === DEATH_SAVE_CRIT_FAIL_ROLL) return `«${DEATH_SAVE_CRIT_FAIL_ROLL}» — ${DEATH_SAVE_CRIT_FAIL_COST} провала сразу`;
  return roll >= DEATH_SAVE_DC ? "успех" : "провал";
}

/** Подпись состояния на листе; у «бросает спасброски» своего слова нет — его говорят галочки. */
export const DEATH_SAVE_STATE_LABELS: Record<Exclude<DeathSaveState, "rolling">, string> = {
  stable: "Стабилизирован: спасброски прекращаются, хиты по-прежнему 0.",
  dead: "Мёртв: три провала.",
};

/**
 * ЕДИНСТВЕННОЕ место, где счётчики обнуляются.
 *
 * Правило SRD — «и те и другие сбрасываются до нуля, когда вы восстанавливаете
 * любое количество хитов», — а путей записи хитов на листе пять: ввод игрока,
 * Кость Хитов, длинный отдых, пул лечения архетипа и левел-ап. Обнулять в
 * каждом значило бы завести пять владельцев одного факта, и шестой путь,
 * добавленный позже, молча прошёл бы мимо. Поэтому функция стоит НЕ на путях
 * записи хитов, а на общей воронке листа: через `onUpdate` проходит каждая
 * запись в персонажа, какой бы кнопкой она ни началась.
 *
 * Условие — «хиты больше нуля», а не «хиты выросли»: состояние важнее события,
 * и заодно сюда попадает старое сохранение, в котором счётчики почему-то
 * остались при живых хитах.
 *
 * Тот же объект возвращается, когда менять нечего: лишняя запись в кампанию не
 * нужна.
 */
export function normalizeDeathSaves(character: Character): Character {
  const alive = character.currentHp > 0;
  const successes = alive ? 0 : clampDeathSaveCount(character.deathSaveSuccesses);
  const failures = alive ? 0 : clampDeathSaveCount(character.deathSaveFailures);
  if (successes === character.deathSaveSuccesses && failures === character.deathSaveFailures) return character;
  return { ...character, deathSaveSuccesses: successes, deathSaveFailures: failures };
}

/** Весь текст раздела SRD одной строкой — для пробы, сверяющей числа с справочником. */
export function deathSaveRulesText(topics: RuleTopic[]): string {
  const topic = topics.find((t) => t.id === DEATH_SAVE_TOPIC_ID);
  if (!topic) return "";
  return topic.blocks
    .map((b) => (b.type === "table" ? b.rows.flat().join(" ") : b.type === "list" ? b.items.join(" ") : b.text))
    .join("\n");
}
