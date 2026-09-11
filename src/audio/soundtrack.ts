// Каталог авторской коллекции музыки и эмбиента из public/audio/soundtrack/.
// Единственный владелец соответствия «латинский путь на диске → русская подпись
// в интерфейсе»: и страница «Саундборд», и индикатор в хедере берут названия
// отсюда, а не выводят их у себя.

export interface SoundtrackTrack {
  id: string;
  title: string;
  src: string;
}

export interface SoundtrackCategory {
  id: string;
  title: string;
  tracks: SoundtrackTrack[];
}

type CategorySpec = [id: string, title: string, files: [file: string, title: string][]];

function build(parent: string, specs: CategorySpec[]): SoundtrackCategory[] {
  return specs.map(([id, title, files]) => ({
    id,
    title,
    tracks: files.map(([file, trackTitle]) => ({
      id: `${id}/${file.replace(/\.[^.]+$/, "")}`,
      title: trackTitle,
      src: `/audio/soundtrack/${parent}${id}/${file}`,
    })),
  }));
}

/** Мелодические темы: играет одна за раз, как трек-лист. */
export const MUSIC_CATEGORIES: SoundtrackCategory[] = build("", [
  ["battle", "Бой", [
    ["battle.mp3", "Битва"],
    ["iron.mp3", "Железо"],
    ["steel.mp3", "Сталь"],
    ["last-stand-of-oakhaven-2.mp3", "Последний рубеж Оакхейвена II"],
    ["the-oath.mp3", "Клятва"],
  ]],
  ["tavern", "Таверна", [
    ["dance.mp3", "Пляска"],
    ["festival.mp3", "Праздник"],
    ["quiet-hour.mp3", "Тихий час"],
    ["last-stand-of-oakhaven.mp3", "Последний рубеж Оакхейвена"],
    ["tavern-music.mp3", "Музыка таверны"],
    ["taverns-dance.mp3", "Танец таверны"],
  ]],
  ["travel", "Путешествия", [
    ["long-road.mp3", "Долгая дорога"],
    ["steps.mp3", "Шаги"],
    ["the-quiet-road-1.mp3", "Тихая дорога I"],
    ["the-quiet-road-2.mp3", "Тихая дорога II"],
    ["road-to-the-whispering.mp3", "Дорога к Шепчущим"],
  ]],
]);

/** Фоновые лупы: несколько звучат одновременно и накладываются на музыку. */
export const AMBIENT_CATEGORIES: SoundtrackCategory[] = build("ambient/", [
  ["wind", "Ветер", [
    ["cave-wind.mp3", "Ветер в пещере"],
    ["desert-storm-wind.mp3", "Песчаная буря"],
    ["gusting-wind.mp3", "Порывистый ветер"],
    ["wind.wav", "Ветер"],
  ]],
  ["rain", "Дождь", [
    ["rain-with-thunder.mp3", "Дождь с грозой"],
    ["light-rain.mp3", "Лёгкий дождь"],
    ["heavy-rain.mp3", "Ливень"],
  ]],
  ["campfire", "Костёр", [
    ["campfire.mp3", "Костёр"],
    ["night-campfire.mp3", "Ночной костёр"],
  ]],
  ["forest", "Лес", [
    ["night-forest.mp3", "Ночной лес"],
    ["birdsong.wav", "Птичье пение"],
    ["stream.wav", "Ручей"],
    ["morning-forest.wav", "Утренний лес"],
  ]],
  ["cave", "Пещера", [
    ["moving-slab.mp3", "Ползущая плита"],
    ["dripping-water.mp3", "Капающая вода"],
    ["cave-draft.mp3", "Сквозняк пещеры"],
    ["dungeon-draft.mp3", "Сквозняк подземелья"],
  ]],
  ["misc", "Разное", [
    ["sea.mp3", "Море"],
    ["waterfall.mp3", "Водопад"],
    ["village.mp3", "Деревня"],
    ["city.mp3", "Звуки города"],
    ["thunderclap.mp3", "Раскат грома"],
  ]],
  ["horrors", "Ужасы", [
    ["ghost-scare.mp3", "Призрак пугает"],
    ["ghost-laugh-female.mp3", "Женский смех призрака"],
    ["ghost-laugh-male.mp3", "Мужской смех призрака"],
    ["slamming-door.mp3", "Хлопнувшая дверь"],
    ["lone-wolf-howl.mp3", "Одинокий волк воет"],
    ["wolf-pack.mp3", "Стая волков"],
  ]],
]);

const BY_ID = new Map<string, SoundtrackTrack>(
  [...MUSIC_CATEGORIES, ...AMBIENT_CATEGORIES].flatMap((category) =>
    category.tracks.map((track) => [track.id, track] as const),
  ),
);

export function findTrack(id: string): SoundtrackTrack | null {
  return BY_ID.get(id) ?? null;
}
