import type { AbilityKey, ArmorProficiency } from "./characterCreationData";
import { ABILITY_LABELS, ARMOR_PROFICIENCY_LABELS } from "./characterCreationData";
import type { Character, RuleTopic } from "../state/types";

/**
 * Черты персонажа. Файл держит ЧЕРТЫ, а не правило про черты.
 *
 * ЧТО SRD И ОТКУДА ОНО ЧИТАЕТСЯ. Само правило — «на некоторых уровнях класс
 * даёт Увеличение характеристик; по необязательному правилу от него можно
 * отказаться в пользу черты; требования черты надо выполнять» — лежит в
 * `src-tauri/rules/rules.json`, раздел `character-feats` «Черты», и это SRD 5.1.
 * Здесь оно не пересказано ни строкой: `readSrdFeat` ниже ЧИТАЕТ этот раздел, а
 * `FEATS_TOPIC_ID` — единственное, что файл о нём знает.
 *
 * Черта «Борец» — тоже SRD: она единственная, что вошла в 5.1, и приезжает
 * оттуда же, тем же чтением. Переименовывать её нельзя и не нужно — имя роздано
 * по лицензии вместе с текстом, и текст показывается как есть, а не переписан.
 *
 * ЧТО НАШЕ. Все остальные черты (`OWN_FEATS`) написаны для этого проекта.
 * Лицензия SRD на них не распространяется: ни имён, ни формулировок SRD в них
 * нет, потому что в SRD их и нет вовсе.
 *
 * ПОЧЕМУ НЕ В `rules.json`. Туда не положено ни строки, и это проверяемая
 * граница проекта: «всё, что пришло из rules.json, — SRD 5.1 под своей
 * атрибуцией». Вкладка «Правила» подписывает всё оттуда одним подвалом про
 * CC BY-NC-SA 4.0 (`pages/RulesPage.tsx`); наша черта, попавшая в тот файл,
 * получила бы эту подпись молча и соврала бы игроку об источнике. Приём
 * отработан трижды — `wildMagicSurges.ts`, `abyssElfRace.ts`,
 * `optionalRules.ts`, — и повторён здесь без изменений.
 *
 * ЧЕМ НАША ЧЕРТА ОТЛИЧАЕТСЯ ОТ КНИЖНОЙ, КРОМЕ ИМЕНИ. Тем же, чем наши двадцать
 * существ (запись 134 в `tasks/DONE.md`) и наши предыстории (запись 10):
 * механика — это правила игры, и она не охраняется, а охраняется ИЗЛОЖЕНИЕ.
 * Поэтому числа местами совпадают с книжными сознательно (подрезать чужой
 * баланс «на глаз» значило бы выдать догадку за проверенное правило), а текст
 * написан заново — не перевод и не пересказ. Наглядно на «Наковальне»: книжная
 * черта того же назначения — это сухая формула «пока вы носите тяжёлые доспехи,
 * урон дробящий, колющий и рубящий от немагического оружия уменьшается на 3»;
 * у нас это «Вы носите железо так давно, что перестали его замечать… Пока на
 * вас тяжёлый доспех, дробящий, колющий и рубящий урон от немагического оружия
 * приходит к вам на 3 меньше», плюс своя прибавка +1 к Силе, которой у книжной
 * черты нет вовсе. Совпадает число 3, расходится всё остальное.
 *
 * Сторож имён — `feats.test.ts`, проба
 * `own_feats_never_use_product_identity_names`: тот же приём, что у своих
 * существ (`own_creatures_never_use_product_identity_names` в
 * `src-tauri/src/combat.rs`), только зона фронтовая, поэтому и проба здесь.
 */

/** Раздел SRD, из которого читается правило и единственная SRD-черта. */
export const FEATS_TOPIC_ID = "character-feats";

/**
 * Что требует черта. Требование — ДАННЫЕ, а не строка в описании: SRD прямо
 * говорит «вы должны соответствовать всем требованиям, чтобы взять её», и
 * требование, оставленное текстом, проверить нечем. Подпись для игрока
 * выводится отсюда (`prerequisiteText`), а не хранится второй строкой.
 */
export type FeatPrerequisite =
  /** Значение характеристики не ниже `min`. */
  | { kind: "ability"; ability: AbilityKey; min: number }
  /** Владение категорией доспехов. */
  | { kind: "armor"; category: ArmorProficiency }
  /** Способность творить хотя бы одно заклинание. */
  | { kind: "spellcasting" };

export interface Feat {
  /** Ключ, который ложится в `Character.feats`. Префикс `feat-`. */
  id: string;
  name: string;
  /** Текст черты: что она даёт. У нашей черты — наш, у «Борца» — прочитанный из SRD. */
  description: string;
  /** Требование, если есть. Проверяется, а не показывается (см. `unmetPrerequisite`). */
  prerequisite?: FeatPrerequisite;
  /**
   * Прибавка к характеристикам, которую черта применяет НА САМОМ ДЕЛЕ (см.
   * `abilitiesWithFeat`). Потолок — тот же 20, что у Улучшения характеристик.
   */
  abilityBonus?: Partial<Record<AbilityKey, number>>;
  /** Откуда черта. `srd` — из `rules.json`, `own` — наша (см. шапку файла). */
  origin: "srd" | "own";
}

/** Потолок значения характеристики — то же правило, что у Улучшения характеристик (SRD). */
export const FEAT_ABILITY_CAP = 20;

/**
 * Наши черты. Имена и текст написаны для проекта; механика местами совпадает с
 * книжной и это сознательно (см. шапку файла). Порядок — порядок показа.
 *
 * Прибавка к характеристике стоит только там, где она заявлена в тексте черты:
 * её применяет `abilitiesWithFeat`, и расхождение «в тексте написано, в данных
 * нет» дало бы игроку одно, а счёту другое.
 */
export const OWN_FEATS: readonly Feat[] = [
  {
    id: "feat-zhilisty",
    name: "Жилистый",
    description:
      "Тело у вас сухое и упрямое: вы держитесь на ногах там, где крепкие с виду люди уже падают. Ваш максимум хитов растёт на 2 за каждый ваш уровень, и прибавка приходит задним числом — за все уровни, что у вас уже есть, и за каждый следующий.",
    origin: "own",
  },
  {
    id: "feat-cepkiy-glaz",
    name: "Цепкий глаз",
    description:
      "Вы замечаете то, на что другие смотрят и не видят: свежую щепку у засова, тень не на своём месте, чужие губы через весь зал. Ваша Мудрость растёт на 1. Пассивные значения Внимательности и Анализа у вас на 5 больше, и вы читаете по губам, если видите говорящего и знаете его язык.",
    abilityBonus: { wisdom: 1 },
    origin: "own",
  },
  {
    id: "feat-legkaya-postup",
    name: "Лёгкая поступь",
    description:
      "Вы не ходите, а переливаетесь с места на место, и ни камни, ни бурелом вас не держат. Ваша скорость растёт на 10 футов. В рывке трудная местность не отнимает у вас лишнего движения, а существо, по которому вы ударили рукопашной атакой, не может ответить вам провоцированной атакой в этом ходу.",
    origin: "own",
  },
  {
    id: "feat-nakovalnya",
    name: "Наковальня",
    prerequisite: { kind: "armor", category: "heavy" },
    description:
      "Вы носите железо так давно, что перестали его замечать: удар приходит в доспех, а не в вас. Ваша Сила растёт на 1. Пока на вас тяжёлый доспех, дробящий, колющий и рубящий урон от немагического оружия приходит к вам на 3 меньше.",
    abilityBonus: { strength: 1 },
    origin: "own",
  },
  {
    id: "feat-kostyak",
    name: "Костяк",
    description:
      "Вас трудно сломать изнутри: яд, холод и боль вы переносите так, будто вам их недодали. Ваше Телосложение растёт на 1, и вы получаете владение спасбросками Телосложения.",
    abilityBonus: { constitution: 1 },
    origin: "own",
  },
  {
    id: "feat-tihaya-tetiva",
    name: "Тихая тетива",
    prerequisite: { kind: "ability", ability: "dexterity", min: 13 },
    description:
      "Вы стреляете в щель, в которую другой не увидит и цели. Половинное и укрытие на три четверти вашим дальнобойным атакам не помеха, а дальняя дистанция вашего оружия не даёт помехи на бросок. Перед дальнобойной атакой из оружия, которым вы владеете, вы можете объявить −5 к броску атаки и при попадании нанести на 10 урона больше.",
    origin: "own",
  },
  {
    id: "feat-shirokiy-zamah",
    name: "Широкий замах",
    prerequisite: { kind: "ability", ability: "strength", min: 15 },
    description:
      "Вы бьёте так, что удар не кончается на первом враге. Когда вы попадаете критически или сводите существо к нулю хитов рукопашной атакой тяжёлым оружием, вы можете бонусным действием сделать этим оружием ещё одну атаку. Перед рукопашной атакой тяжёлым оружием, которым вы владеете, вы можете объявить −5 к броску атаки и при попадании нанести на 10 урона больше.",
    origin: "own",
  },
  {
    id: "feat-vtoraya-ruka",
    name: "Вторая рука",
    prerequisite: { kind: "ability", ability: "dexterity", min: 13 },
    description:
      "Левая рука у вас работает не хуже правой и не ждёт, пока правая закончит. Пока вы держите по оружию в каждой руке, ваш Класс Доспеха на 1 больше. Сражаться двумя оружиями вы можете и теми, что не имеют свойства «лёгкое», а обнажать или убирать за раз вы можете два оружия вместо одного.",
    origin: "own",
  },
  {
    id: "feat-koshachya-tishina",
    name: "Кошачья тишина",
    prerequisite: { kind: "ability", ability: "dexterity", min: 13 },
    description:
      "Вас теряют из виду раньше, чем успевают понять, что вы уходите. Ваша Ловкость растёт на 1. Вы можете прятаться, находясь в слегка заслонённом месте; промах дальнобойной атакой из укрытия не выдаёт вашего положения; тусклый свет не даёт вам помехи на проверки Внимательности, основанные на зрении.",
    abilityBonus: { dexterity: 1 },
    origin: "own",
  },
  {
    id: "feat-ruka-znaharya",
    name: "Рука знахаря",
    description:
      "Вы умеете вернуть человека оттуда, откуда его обычно уже не возвращают. Стабилизируя умирающее существо, вы поднимаете ему 1 хит. Действием вы можете потратить одно применение набора лекаря и вернуть существу 1к6 + 4 хита плюс столько хитов, каков его уровень; этому же существу второй раз так помочь нельзя, пока оно не отдохнёт.",
    origin: "own",
  },
  {
    id: "feat-slovo-pod-udar",
    name: "Слово под удар",
    prerequisite: { kind: "spellcasting" },
    description:
      "Вы держите заклинание в голове, даже когда вас бьют по этой голове. У вас преимущество на спасброски за сохранение концентрации. Вы творите заклинания с жестовыми компонентами, когда руки заняты оружием или щитом. Вместо провоцированной атаки вы можете наложить на провоцирующее существо заклинание, которое творится одним действием и целит в одно существо.",
    origin: "own",
  },
  {
    id: "feat-pamyatlivy",
    name: "Памятливый",
    description:
      "Ваша голова не выбрасывает ничего: ни разговора, ни поворота коридора, ни того, сколько было свечей. Ваш Интеллект растёт на 1. Вы точно помните всё, что видели и слышали за последний месяц, и в любой момент знаете, где север и сколько часов осталось до рассвета или до заката.",
    abilityBonus: { intelligence: 1 },
    origin: "own",
  },
  {
    id: "feat-chutkiy-son",
    name: "Чуткий сон",
    description:
      "Вы просыпаетесь от того, чего ещё не случилось, и в бою вас не застают врасплох. Пока вы в сознании, вас нельзя застать неожиданно, ваши броски инициативы идут с прибавкой 5, и невидимый или скрытый противник не получает преимущества на броски атаки против вас только за то, что вы его не видите.",
    origin: "own",
  },
  {
    id: "feat-tyazhelaya-poklazha",
    name: "Тяжёлая поклажа",
    description:
      "Вы уносите с собой столько, сколько обычно грузят на мула. Ваша Сила растёт на 1. Ваша переносимая нагрузка удваивается, а на проверки Силы, чтобы сдвинуть, поднять или удержать тяжёлое, у вас преимущество.",
    abilityBonus: { strength: 1 },
    origin: "own",
  },
];

/** Русские подписи характеристик по ключу — берутся у `ABILITY_LABELS`, а не заводятся второй копией. */
const ABILITY_LABEL_BY_KEY = new Map(ABILITY_LABELS);

/**
 * Русское имя характеристики → её ключ. Нужно ровно затем, чтобы прочитать
 * число требования «Борца» из текста SRD, а не вписать его сюда руками: у
 * числа 13 один владелец — `rules.json`.
 */
const ABILITY_KEY_BY_LABEL = new Map(ABILITY_LABELS.map(([key, label]) => [label, key]));

/**
 * Черта «Борец» из раздела `character-feats` — ЧИТАЕТСЯ, а не копируется.
 *
 * Разбор держится формы раздела: заголовок 2 уровня — имя черты, следующий
 * абзац «Требование: …» — требование, остальные блоки до конца раздела —
 * текст. Требование разбирается в данные (`{ ability, min }`), потому что SRD
 * велит его проверять, а не показывать; число берётся из текста, поэтому оно
 * остаётся у `rules.json` в единственном экземпляре.
 *
 * Раздела нет или он изменил форму — вернётся `null`, и список черт останется
 * из наших. Это честнее, чем подставить копию: пустое место видно, а копия
 * молча пережила бы правку справочника.
 */
export function readSrdFeat(topics: RuleTopic[]): Feat | null {
  const topic = topics.find((t) => t.id === FEATS_TOPIC_ID);
  if (!topic) return null;
  const headingIndex = topic.blocks.findIndex((b) => b.type === "heading" && b.level === 2);
  if (headingIndex < 0) return null;
  const heading = topic.blocks[headingIndex];
  if (heading.type !== "heading") return null;
  const name = heading.text.trim();
  if (!name) return null;

  const rest = topic.blocks.slice(headingIndex + 1);
  let prerequisite: FeatPrerequisite | undefined;
  const textParts: string[] = [];
  for (const block of rest) {
    if (block.type === "heading") break;
    if (block.type === "paragraph") {
      const parsed = parsePrerequisiteLine(block.text);
      if (parsed) {
        prerequisite = parsed;
        continue;
      }
      textParts.push(block.text.trim());
    } else if (block.type === "list") {
      textParts.push(block.items.map((item) => item.trim()).join(" "));
    } else if (block.type === "table") {
      textParts.push(block.rows.map((row) => row.join(" ")).join(" "));
    }
  }
  const description = textParts.filter(Boolean).join(" ");
  if (!description) return null;
  return { id: "feat-srd-grappler", name, description, prerequisite, origin: "srd" };
}

/** «Требование: Сила 13 или выше» → данные. Не строка требования — `null`. */
function parsePrerequisiteLine(text: string): FeatPrerequisite | null {
  const match = /^\s*Требовани[ея]\s*:\s*(\S+)\s+(\d+)/u.exec(text);
  if (!match) return null;
  const ability = ABILITY_KEY_BY_LABEL.get(match[1]);
  if (!ability) return null;
  return { kind: "ability", ability, min: Number(match[2]) };
}

/**
 * Все черты приложения: SRD-черта (если справочник прочитан) плюс наши.
 * Порядок — SRD первой: она единственная, чьё имя игрок мог видеть в книге.
 */
export function allFeats(topics: RuleTopic[]): Feat[] {
  const srd = readSrdFeat(topics);
  return srd ? [srd, ...OWN_FEATS] : [...OWN_FEATS];
}

/** Подпись требования для игрока. Единственный владелец этого текста. */
export function prerequisiteText(prerequisite: FeatPrerequisite): string {
  switch (prerequisite.kind) {
    case "ability":
      return `${ABILITY_LABEL_BY_KEY.get(prerequisite.ability) ?? prerequisite.ability} ${prerequisite.min} или выше`;
    case "armor":
      return `владение: ${ARMOR_PROFICIENCY_LABELS[prerequisite.category]}`;
    case "spellcasting":
      return "способность творить хотя бы одно заклинание";
  }
}

/**
 * Умеет ли персонаж творить заклинания. Спрашивается у самого персонажа, а не
 * у таблицы класса: заклинания приходят и от расы (`abyssElfRace.ts`), и от
 * архетипа, и требование SRD сформулировано именно про способность, а не про
 * класс. Заговор — тоже заклинание, поэтому он здесь считается.
 */
function canCastSpells(character: Character): boolean {
  return character.knownCantrips.length > 0 || character.spellSlotsMax.some((slots) => slots > 0);
}

/**
 * Почему черта недоступна — строка для игрока, либо `null`, если доступна.
 * ЕДИНСТВЕННЫЙ владелец этого решения: панель выбора и лист персонажа
 * спрашивают отсюда, а сами условия не сверяют. Причина выдаётся тем же
 * вызовом, что и запрет, — иначе показ начал бы догадываться о причине.
 */
export function unmetPrerequisite(feat: Feat, character: Character): string | null {
  const prerequisite = feat.prerequisite;
  if (!prerequisite) return null;
  switch (prerequisite.kind) {
    case "ability": {
      const score = character.abilities[prerequisite.ability];
      if (score >= prerequisite.min) return null;
      const label = ABILITY_LABEL_BY_KEY.get(prerequisite.ability) ?? prerequisite.ability;
      return `требуется ${label} ${prerequisite.min} или выше, у вас ${score}`;
    }
    case "armor":
      if (character.armorProficiencies.includes(prerequisite.category)) return null;
      return `требуется владение: ${ARMOR_PROFICIENCY_LABELS[prerequisite.category]}`;
    case "spellcasting":
      if (canCastSpells(character)) return null;
      return "требуется способность творить хотя бы одно заклинание";
  }
}

/**
 * Уже взятая черта. Каждую черту можно брать только один раз — так сказано в
 * SRD, и повтор в списке `Character.feats` означал бы двойную прибавку к
 * характеристике.
 */
export function hasFeat(character: Character, featId: string): boolean {
  return character.feats.includes(featId);
}

/** Можно ли взять черту прямо сейчас: требование выполнено и она ещё не взята. */
export function canTakeFeat(feat: Feat, character: Character): boolean {
  return !hasFeat(character, feat.id) && unmetPrerequisite(feat, character) === null;
}

/**
 * Черты персонажа по его списку id — в порядке `allFeats`, а не в порядке
 * взятия: список показа обязан быть устойчивым. Неизвестный id пропускается
 * молча: так открывается сохранение, записанное при другом наборе черт.
 */
export function featsOf(character: Character, feats: Feat[]): Feat[] {
  return feats.filter((feat) => character.feats.includes(feat.id));
}

/**
 * Характеристики после взятия черты. ЕДИНСТВЕННОЕ место, где прибавка черты
 * превращается в числа: лист персонажа применяет её тем же вызовом, которым
 * применяет Улучшение характеристик, — через общий `applyLevelUp`, а не своей
 * записью. Потолок тот же 20: черта не обходит правило, от которого она
 * отказалась.
 *
 * Черта без прибавки возвращает ТОТ ЖЕ объект — лишняя запись не нужна.
 */
export function abilitiesWithFeat(
  abilities: Character["abilities"],
  feat: Feat,
): Character["abilities"] {
  if (!feat.abilityBonus) return abilities;
  const next = { ...abilities };
  for (const [key, bonus] of Object.entries(feat.abilityBonus) as [AbilityKey, number][]) {
    next[key] = Math.min(FEAT_ABILITY_CAP, next[key] + bonus);
  }
  return next;
}

/**
 * Подпись на шаге «Итог» мастера: у персонажа 1 уровня черты нет, и это НЕ
 * пустое место, а правило. Показать надо и то, когда она появится, — уровень
 * приходит от таблицы класса (`asiLevels` в `classProgression.ts`), сюда он
 * передаётся числом: владелец лесенки уровней там, а не здесь.
 *
 * Класс не выбран (уровня нет) — говорится только правило: выдумывать «на 4
 * уровне» за класс, которого ещё нет, значило бы обещать за таблицу.
 */
export function firstFeatLevelHint(firstAsiLevel: number | undefined): string {
  const base =
    "Черт у персонажа 1 уровня нет: черта берётся вместо Увеличения характеристик, а первая такая точка приходит позже.";
  if (!firstAsiLevel) return base;
  return `${base} У этого класса — на ${firstAsiLevel} уровне; выбор «увеличение или черта» откроется на листе персонажа при повышении уровня.`;
}
