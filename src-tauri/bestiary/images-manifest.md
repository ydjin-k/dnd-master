# Манифест картинок бестиария

Соответствие «файл арта → существо SRD 5.1 → `id`» для каталога
`src-tauri/bestiary/images/`. Собран карточкой `bestiary-art-filenames-to-monster-ids`.

**Зачем он нужен.** Сами картинки в git не коммитятся (решение владельца: 400+ файлов ≈ 1.1 ГБ,
арт входит в историю только когда существо заведено в `bestiary.json`). Манифест — маленький и
versionable, поэтому разбор арта переживает переустановку и не делается заново. Будущая карточка
на ~250 существ SRD берёт готовое сопоставление отсюда.

**Правило имени** (из `images/README.md`): имя файла = `id` существа из `bestiary.json`.
Id — латинский, от **английского** имени SRD, не транслитерация русского:
`Аболет.png` → `aboleth.png`, а не `abolet.png`.

**Где лежат файлы.** Физически каталог живёт в рабочем дереве владельца
(`gourami/src-tauri/bestiary/images`); в git попадает только 51 файл существ, уже заведённых в
`bestiary.json`.

## Сводка

| | |
|---|---|
| Переименовано | 163 |
| Дубликаты (имя `id` уже занято) | 48 |
| Не опознано / нет в SRD 5.1 | 26 |
| Осталось разобрать (`ChatGPT Image…`) | 171 |
| Файлов в каталоге сейчас | 460 |

## Переименованные

Формат: исходное имя → русское название → английское имя SRD → новое имя файла.

| Было | Русское название | SRD (англ.) | Стало |
|---|---|---|---|
| `Аракокра.png` | Аракокра | Aarakocra | `aarakocra.png` |
| `Аболет.png` | Аболет | Aboleth | `aboleth.png` |
| `Прислужник.png` | Прислужник | Acolyte | `acolyte.png` |
| `Взрослый чёрный дракон.png` | Взрослый чёрный дракон | Adult Black Dragon | `adult-black-dragon.png` |
| `Взрослый синий дракон.png` | Взрослый синий дракон | Adult Blue Dragon | `adult-blue-dragon.png` |
| `Взрослый зелёный дракон.png` | Взрослый зелёный дракон | Adult Green Dragon | `adult-green-dragon.png` |
| `Взрослый красный дракон.png` | Взрослый красный дракон | Adult Red Dragon | `adult-red-dragon.png` |
| `Взрослый белый дракон.png` | Взрослый белый дракон | Adult White Dragon | `adult-white-dragon.png` |
| `Аллозавр.png` | Аллозавр | Allosaurus | `allosaurus.png` |
| `Древний чёрный дракон.png` | Древний чёрный дракон | Ancient Black Dragon | `ancient-black-dragon.png` |
| `Древний синий дракон.png` | Древний синий дракон | Ancient Blue Dragon | `ancient-blue-dragon.png` |
| `Древний зелёный дракон.png` | Древний зелёный дракон | Ancient Green Dragon | `ancient-green-dragon.png` |
| `Древний красный дракон.png` | Древний красный дракон | Ancient Red Dragon | `ancient-red-dragon.png` |
| `Древний белый дракон.png` | Древний белый дракон | Ancient White Dragon | `ancient-white-dragon.png` |
| `Андросфинкс.png` | Андросфинкс | Androsphinx | `androsphinx.png` |
| `Анхег.png` | Анхег | Ankheg | `ankheg.png` |
| `Анкилозавр.png` | Анкилозавр | Ankylosaurus | `ankylosaurus.png` |
| `Архимаг.png` | Архимаг | Archmage | `archmage.png` |
| `Наёмный убийца.png` | Наёмный убийца | Assassin | `assassin.png` |
| `Пробуждённый куст.png` | Пробуждённый куст | Awakened Shrub | `awakened-shrub.png` |
| `Пробуждённое дерево.png` | Пробуждённое дерево | Awakened Tree | `awakened-tree.png` |
| `Топороклюв.png` | Топороклюв | Axe Beak | `axe-beak.png` |
| `Балор.png` | Балор | Balor | `balor.png` |
| `Капитан разбойников.png` | Капитан разбойников | Bandit Captain | `bandit-captain.png` |
| `Баньши.png` | Баньши | Banshee | `banshee.png` |
| `Василиск.png` | Василиск | Basilisk | `basilisk.png` |
| `Бехир.png` | Бехир | Behir | `behir.png` |
| `Берсерк.png` | Берсерк | Berserker | `berserker.png` |
| `Вирмлинг чёрного дракона.png` | Вирмлинг чёрного дракона | Black Dragon Wyrmling | `black-dragon-wyrmling.png` |
| `Мерцающий пёс.png` | Мерцающий пёс | Blink Dog | `blink-dog.png` |
| `Вирмлинг синего дракона.png` | Вирмлинг синего дракона | Blue Dragon Wyrmling | `blue-dragon-wyrmling.png` |
| `панцирница_хищник_древних_пустошей.png` | Панцирница | Bulette | `bulette.png` |
| `ползающий_падальщик_на_пергаменте.png` | Ползающий падальщик | Carrion Crawler | `carrion-crawler.png` |
| `Глиняный голем.png` | Глиняный голем | Clay Golem | `clay-golem.png` |
| `плащевик_хищник_из_тьмы.png` | Плащевик | Cloaker | `cloaker.png` |
| `Облачный великан.png` | Облачный великан | Cloud Giant | `cloud-giant.png` |
| `Обыватель.png` | Обыватель | Commoner | `commoner.png` |
| `Фанатик культа.png` | Фанатик культа | Cult Fanatic | `cult-fanatic.png` |
| `Культист.png` | Культист | Cultist | `cultist.png` |
| `Пёс смерти.png` | Пёс смерти | Death Dog | `death-dog.png` |
| `Глубинный гном (Свирфнеблин).png` | Глубинный гном (Свирфнеблин) | Deep Gnome (Svirfneblin) | `deep-gnome-svirfneblin.png` |
| `Олень.png` | Олень | Deer | `deer.png` |
| `Демилич.png` | Демилич | Demilich | `demilich.png` |
| `Дэв.png` | Дэва | Deva | `deva.png` |
| `Лютый волк.png` | Лютый волк | Dire Wolf | `dire-wolf.png` |
| `Гении.png` | Гении (на арте джинн) | Djinni | `djinni.png` |
| `Доппельгангер.png` | Доппельгангер | Doppelganger | `doppelganger.png` |
| `Дракочерепаха.png` | Дракочерепаха | Dragon Turtle | `dragon-turtle.png` |
| `Дретч.png` | Дретч | Dretch | `dretch.png` |
| `Драук.png` | Драук | Drider | `drider.png` |
| `Друид.png` | Друид | Druid | `druid.png` |
| `Дриада.png` | Дриада | Dryad | `dryad.png` |
| `Дуэргар.png` | Дуэргар | Duergar | `duergar.png` |
| `Огненный великан.png` | Огненный великан | Fire Giant | `fire-giant.png` |
| `Мясной голем.png` | Мясной голем | Flesh Golem | `flesh-golem.png` |
| `Летающая змея.png` | Летающая змея | Flying Snake | `flying-snake.png` |
| `Лягушка.png` | Лягушка | Frog | `frog.png` |
| `Ледяной великан.png` | Ледяной великан | Frost Giant | `frost-giant.png` |
| `Горгулья.png` | Горгулья | Gargoyle | `gargoyle.png` |
| `Больная гигантская крыса.png` | Больная гигантская крыса | Giant Rat (Diseased) | `giant-rat-diseased.png` |
| `Гигантский морской конёк.png` | Гигантский морской конёк | Giant Sea Horse | `giant-sea-horse.png` |
| `Гигантская акула.png` | Гигантская акула | Giant Shark | `giant-shark.png` |
| `Гигантский паук.png` | Гигантский паук | Giant Spider | `giant-spider.png` |
| `Бормочущий ротовик.png` | Бормочущий ротовик | Gibbering Mouther | `gibbering-mouther.png` |
| `Глабрезу.png` | Глабрезу | Glabrezu | `glabrezu.png` |
| `Гладиатор.png` | Гладиатор | Gladiator | `gladiator.png` |
| `Гнолл.png` | Гнолл | Gnoll | `gnoll.png` |
| `Гнолл клык Йеногу.png` | Гнолл клык Йеногу | Gnoll Fang of Yeenoghu | `gnoll-fang-of-yeenoghu.png` |
| `Вожак стаи гноллов.png` | Вожак стаи гноллов | Gnoll Pack Lord | `gnoll-pack-lord.png` |
| `Гоблин.png` | Гоблин | Goblin | `goblin.png` |
| `Босс гоблинов.png` | Босс гоблинов | Goblin Boss | `goblin-boss.png` |
| `Горгона.png` | Горгона | Gorgon | `gorgon.png` |
| `Вирмлинг зелёного дракона.png` | Вирмлинг зелёного дракона | Green Dragon Wyrmling | `green-dragon-wyrmling.png` |
| `Грифон.png` | Грифон | Griffon | `griffon.png` |
| `Гримлок.png` | Гримлок | Grimlock | `grimlock.png` |
| `Страж.png` | Страж | Guard | `guard.png` |
| `Гарпия.png` | Гарпия | Harpy | `harpy.png` |
| `Адская гончая.png` | Адская гончая | Hell Hound | `hell-hound.png` |
| `Хезроу.png` | Хезроу | Hezrou | `hezrou.png` |
| `Холмовой великан.png` | Холмовой великан | Hill Giant | `hill-giant.png` |
| `Гиппогриф.png` | Гиппогриф | Hippogriff | `hippogriff.png` |
| `Гомункул.png` | Гомункул | Homunculus | `homunculus.png` |
| `Охотничья акула.png` | Охотничья акула | Hunter Shark | `hunter-shark.png` |
| `Гидра.png` | Гидра | Hydra | `hydra.png` |
| `Бес.png` | Бес | Imp | `imp.png` |
| `Железный голем.png` | Железный голем | Iron Golem | `iron-golem.png` |
| `Рыцарь.png` | Рыцарь | Knight | `knight.png` |
| `Лев.png` | Лев | Lion | `lion.png` |
| `Ящерица.png` | Ящерица | Lizard | `lizard.png` |
| `Маг.png` | Маг | Mage | `mage.png` |
| `Мамонт.png` | Мамонт | Mammoth | `mammoth.png` |
| `Мэйн.png` | Мэйн | Manes | `manes.png` |
| `Марилит.png` | Марилит | Marilith | `marilith.png` |
| `Мастифф.png` | Мастифф | Mastiff | `mastiff.png` |
| `Мул.png` | Мул | Mule | `mule.png` |
| `Налфешни.png` | Налфешни | Nalfeshnee | `nalfeshnee.png` |
| `Дворянин.png` | Дворянин | Noble | `noble.png` |
| `Осьминог.png` | Осьминог | Octopus | `octopus.png` |
| `отидж_чудовище_из_бестиария.png` | Отидж | Otyugh | `otyugh.png` |
| `Сова.png` | Сова | Owl | `owl.png` |
| `Пантера.png` | Пантера | Panther | `panther.png` |
| `белый_пегас_на_старинном_пергаменте.png` | Пегас | Pegasus | `pegasus.png` |
| `Исчезающий паук.png` | Исчезающий паук | Phase Spider | `phase-spider.png` |
| `Планетар.png` | Планетар | Planetar | `planetar.png` |
| `Плезиозавр.png` | Плезиозавр | Plesiosaurus | `plesiosaurus.png` |
| `Ядовитая змея.png` | Ядовитая змея | Poisonous Snake | `poisonous-snake.png` |
| `Белый медведь.png` | Белый медведь | Polar Bear | `polar-bear.png` |
| `антикварная_карточка_с_пони.png` | Пони | Pony | `pony.png` |
| `Священник.png` | Священник | Priest | `priest.png` |
| `Птеранодон.png` | Птеранодон | Pteranodon | `pteranodon.png` |
| `Квазит.png` | Квазит | Quasit | `quasit.png` |
| `Квиппер.png` | Квиппер | Quipper | `quipper.png` |
| `Крыса.png` | Крыса | Rat | `rat.png` |
| `Ворон.png` | Ворон | Raven | `raven.png` |
| `Вирмлинг красного дракона.png` | Вирмлинг красного дракона | Red Dragon Wyrmling | `red-dragon-wyrmling.png` |
| `Рифовая акула.png` | Рифовая акула | Reef Shark | `reef-shark.png` |
| `Носорог.png` | Носорог | Rhinoceros | `rhinoceros.png` |
| `Ездовая лошадь.png` | Ездовая лошадь | Riding Horse | `riding-horse.png` |
| `Верёвочник.png` | Верёвочник | Roper | `roper.png` |
| `Саблезубый тигр.png` | Саблезубый тигр | Saber-Toothed Tiger | `saber-toothed-tiger.png` |
| `Скорпион.png` | Скорпион | Scorpion | `scorpion.png` |
| `Морской конёк.png` | Морской конёк | Sea Horse | `sea-horse.png` |
| `ползающая_насыпь_болотный_голем.png` | Ползающая насыпь | Shambling Mound | `shambling-mound.png` |
| `Визгун.png` | Визгун | Shrieker | `shrieker.png` |
| `Солар.png` | Солар | Solar | `solar.png` |
| `Паук.png` | Паук | Spider | `spider.png` |
| `Шпион.png` | Шпион | Spy | `spy.png` |
| `Каменный великан.png` | Каменный великан | Stone Giant | `stone-giant.png` |
| `Каменный голем.png` | Каменный голем | Stone Golem | `stone-golem.png` |
| `Штормовой великан.png` | Штормовой великан | Storm Giant | `storm-giant.png` |
| `рой_летучих_мышей_на_старинной_карте.png` | Рой летучих мышей | Swarm of Bats | `swarm-of-bats.png` |
| `Рой жуков.png` | Рой жуков | Swarm of Beetles | `swarm-of-beetles.png` |
| `рой_многоножек_на_древнем_пергаменте.png` | Рой многоножек | Swarm of Centipedes | `swarm-of-centipedes.png` |
| `Рой насекомых.png` | Рой насекомых | Swarm of Insects | `swarm-of-insects.png` |
| `Рой ядовитых змей.png` | Рой ядовитых змей | Swarm of Poisonous Snakes | `swarm-of-poisonous-snakes.png` |
| `Рой квипперов.png` | Рой квипперов | Swarm of Quippers | `swarm-of-quippers.png` |
| `Рой крыс.png` | Рой крыс | Swarm of Rats | `swarm-of-rats.png` |
| `Рой воронов.png` | Рой воронов | Swarm of Ravens | `swarm-of-ravens.png` |
| `Рой пауков.png` | Рой пауков | Swarm of Spiders | `swarm-of-spiders.png` |
| `Рой ос.png` | Рой ос | Swarm of Wasps | `swarm-of-wasps.png` |
| `Головорез.png` | Головорез | Thug | `thug.png` |
| `Тигр.png` | Тигр | Tiger | `tiger.png` |
| `Воитель племени.png` | Воитель племени | Tribal Warrior | `tribal-warrior.png` |
| `Трицератопс.png` | Трицератопс | Triceratops | `triceratops.png` |
| `Тираннозавр рекс.png` | Тираннозавр рекс | Tyrannosaurus Rex | `tyrannosaurus-rex.png` |
| `Бурый увалень.png` | Бурый увалень | Umber Hulk | `umber-hulk.png` |
| `Вампиры.png` | Вампиры (на арте один вампир) | Vampire | `vampire.png` |
| `Ветеран.png` | Ветеран | Veteran | `veteran.png` |
| `Врок.png` | Врок | Vrock | `vrock.png` |
| `Гриф.png` | Гриф | Vulture | `vulture.png` |
| `Боевой конь.png` | Боевой конь | Warhorse | `warhorse.png` |
| `Водная аномалия.png` | Водная аномалия | Water Weird | `water-weird.png` |
| `Куница.png` | Куница | Weasel | `weasel.png` |
| `Вирмлинг белого дракона.png` | Вирмлинг белого дракона | White Dragon Wyrmling | `white-dragon-wyrmling.png` |
| `Блуждающий огонёк.png` | Блуждающий огонёк | Will-o'-Wisp | `will-o-wisp.png` |
| `Полярный волк.png` | Полярный волк | Winter Wolf | `winter-wolf.png` |
| `Ворг.png` | Ворг | Worg | `worg.png` |
| `Виверна.png` | Виверна | Wyvern | `wyvern.png` |
| `Молодой чёрный дракон.png` | Молодой чёрный дракон | Young Black Dragon | `young-black-dragon.png` |
| `Молодой синий дракон.png` | Молодой синий дракон | Young Blue Dragon | `young-blue-dragon.png` |
| `Молодой зелёный дракон.png` | Молодой зелёный дракон | Young Green Dragon | `young-green-dragon.png` |
| `Молодой красный дракон.png` | Молодой красный дракон | Young Red Dragon | `young-red-dragon.png` |
| `Молодой белый дракон.png` | Молодой белый дракон | Young White Dragon | `young-white-dragon.png` |

## Дубликаты — не трогать, решает владелец

Два файла на одно существо: целевое имя `<id>` уже занято (как правило —
уже закоммиченным файлом того же существа). Оба файла оставлены как есть,
ничего не перезаписано. Какой арт оставить — решение владельца.

| Файл (оставлен без изменений) | Русское название | SRD (англ.) | Занятое имя |
|---|---|---|---|
| `Человекообразная обезьяна.png` | Человекообразная обезьяна | Ape | `ape.png` |
| `Бабуин.png` | Бабуин | Baboon | `baboon.png` |
| `Барсук.png` | Барсук | Badger | `badger.png` |
| `Летучая мышь.png` | Летучая мышь | Bat | `bat.png` |
| `Чёрный медведь.png` | Чёрный медведь | Black Bear | `black-bear.png` |
| `Кровавый ястреб.png` | Кровавый ястреб | Blood Hawk | `blood-hawk.png` |
| `Кабан.png` | Кабан | Boar | `boar.png` |
| `Бурый медведь.png` | Бурый медведь | Brown Bear | `brown-bear.png` |
| `Верблюд.png` | Верблюд | Camel | `camel.png` |
| `Кошка.png` | Кошка | Cat | `cat.png` |
| `Удав.png` | Удав | Constrictor Snake | `constrictor-snake.png` |
| `Краб.png` | Краб | Crab | `crab.png` |
| `Крокодил.png` | Крокодил | Crocodile | `crocodile.png` |
| `Дэва.png` | Дэва | Deva | `deva.png` |
| `Упряжная лошадь.png` | Упряжная лошадь | Draft Horse | `draft-horse.png` |
| `Орёл.png` | Орёл | Eagle | `eagle.png` |
| `Слон.png` | Слон | Elephant | `elephant.png` |
| `Лось.png` | Лось | Elk | `elk.png` |
| `Гигантская человекообразная обезьяна.png` | Гигантская человекообразная обезьяна | Giant Ape | `giant-ape.png` |
| `Гигантский барсук.png` | Гигантский барсук | Giant Badger | `giant-badger.png` |
| `Гигантская летучая мышь.png` | Гигантская летучая мышь | Giant Bat | `giant-bat.png` |
| `Гигантский кабан.png` | Гигантский кабан | Giant Boar | `giant-boar.png` |
| `Гигантская многоножка.png` | Гигантская многоножка | Giant Centipede | `giant-centipede.png` |
| `Гигантский удав.png` | Гигантский удав | Giant Constrictor Snake | `giant-constrictor-snake.png` |
| `Гигантский краб.png` | Гигантский краб | Giant Crab | `giant-crab.png` |
| `Гигантский крокодил.png` | Гигантский крокодил | Giant Crocodile | `giant-crocodile.png` |
| `Гигантский орёл.png` | Гигантский орёл | Giant Eagle | `giant-eagle.png` |
| `Гигантский лось.png` | Гигантский лось | Giant Elk | `giant-elk.png` |
| `Гигантский огненный жук.png` | Гигантский огненный жук | Giant Fire Beetle | `giant-fire-beetle.png` |
| `Гигантская лягушка.png` | Гигантская лягушка | Giant Frog | `giant-frog.png` |
| `Гигантский козёл.png` | Гигантский козёл | Giant Goat | `giant-goat.png` |
| `Гигантская гиена.png` | Гигантская гиена | Giant Hyena | `giant-hyena.png` |
| `Гигантская ящерица.png` | Гигантская ящерица | Giant Lizard | `giant-lizard.png` |
| `Гигантский осьминог.png` | Гигантский осьминог | Giant Octopus | `giant-octopus.png` |
| `Гигантская сова.png` | Гигантская сова | Giant Owl | `giant-owl.png` |
| `Гигантская ядовитая змея.png` | Гигантская ядовитая змея | Giant Poisonous Snake | `giant-poisonous-snake.png` |
| `Гигантская крыса.png` | Гигантская крыса | Giant Rat | `giant-rat.png` |
| `Гигантский скорпион.png` | Гигантский скорпион | Giant Scorpion | `giant-scorpion.png` |
| `Гигантская жаба.png` | Гигантская жаба | Giant Toad | `giant-toad.png` |
| `Гигантский гриф.png` | Гигантский гриф | Giant Vulture | `giant-vulture.png` |
| `Гигантская оса.png` | Гигантская оса | Giant Wasp | `giant-wasp.png` |
| `Гигантская куница.png` | Гигантская куница | Giant Weasel | `giant-weasel.png` |
| `Гигантский паук-волк.png` | Гигантский паук-волк | Giant Wolf Spider | `giant-wolf-spider.png` |
| `Козёл.png` | Козёл | Goat | `goat.png` |
| `Ястреб.png` | Ястреб | Hawk | `hawk.png` |
| `Гиена.png` | Гиена | Hyena | `hyena.png` |
| `Шакал.png` | Шакал | Jackal | `jackal.png` |
| `Косатка.png` | Косатка | Killer Whale | `killer-whale.png` |

## Не опознано или нет в SRD 5.1 — не переименовано

Файлы оставлены с исходными именами. Проект возит только SRD 5.1, поэтому существа
вне SRD в `bestiary.json` не заводятся — что делать с этим артом, решает владелец.

| Файл | Похоже на | Причина |
|---|---|---|
| `Альфа грик.png` | Grick Alpha | Нет в SRD 5.1 — в SRD есть только Grick (грик) |
| `Ангелы.png` | — | Обобщающая карточка «ангелы». Все три ангела SRD (deva, planetar, solar) уже есть отдельными файлами; какой статблок имелся в виду — решает владелец |
| `Арканалот.png` | Arcanaloth | Нет в SRD 5.1 — юголоты в SRD не входят |
| `Ацерерак.png` | Acererak | Нет в SRD 5.1 — именной NPC |
| `Барлгура.png` | Barlgura | Нет в SRD 5.1 |
| `Барон сахуагинов.png` | Sahuagin Baron | Нет в SRD 5.1 — в SRD есть только Sahuagin |
| `Взрослый синий драколич.png` | Adult Blue Dracolich | Нет в SRD 5.1 |
| `Водянник.png` | — | Славянский водяной; однозначного соответствия в SRD 5.1 нет. Опознано по арту: тощий утопленник в водорослях, не мерфолк и не мерроу |
| `Волшебный дракончик.png` | Faerie Dragon | Нет в SRD 5.1. Опознано по арту: крылья бабочки — это фейский дракон, НЕ псевдодракон |
| `Газовая спора.png` | Gas Spore | Нет в SRD 5.1 |
| `Галеб дур.png` | Galeb Duhr | Нет в SRD 5.1 |
| `Гитцерай зерт.png` | Githzerai Zerth | Нет в SRD 5.1 |
| `Гитцерай монах.png` | Githzerai Monk | Нет в SRD 5.1 |
| `Гитъянки воитель.png` | Githyanki Warrior | Нет в SRD 5.1 |
| `Гитъянки рыцарь.png` | Githyanki Knight | Нет в SRD 5.1 |
| `Гористро.png` | Goristro | Нет в SRD 5.1 |
| `Грелл.png` | Grell | Нет в SRD 5.1 |
| `Йоклол.png` | Yochlol | Нет в SRD 5.1 |
| `Молодой красный теневой дракон.png` | Young Red Shadow Dragon | Нет в SRD 5.1 — шаблон теневого дракона в SRD отсутствует |
| `перитон_страница_древнего_бестиария.png` | Peryton | Нет в SRD 5.1 |
| `Пещерный медведь.png` | Cave Bear | Нет в SRD 5.1 |
| `пикси_с_сияющими_крыльями_на_пергаменте.png` | Pixie | Нет в SRD 5.1 — в SRD есть Sprite (спрайт), это другое существо |
| `пожиратель_интеллекта.png` | Intellect Devourer | Нет в SRD 5.1 |
| `ползающая_рука_на_древнем_пергаменте.png` | Crawling Claw | Нет в SRD 5.1 |
| `Теневой демон.png` | Shadow Demon | Нет в SRD 5.1 |
| `Чазм.png` | Chasme | Нет в SRD 5.1 |

## Повторный запуск

Карточка пригодна к повторному прогону: уже названные по `id` файлы второй проход не трогает
(целевое имя совпадает с текущим — файл пропускается). Владелец продолжает докладывать арт,
поэтому в каталоге со временем снова появятся неразобранные `ChatGPT Image…`.

Перед каждым переименованием проверяется, что файл **не отслеживается git** — закоммиченные 51
имя привязаны к `imageAsset` в `bestiary.json`, и переименование сломало бы показ картинки.
Перезапись запрещена: если целевое имя занято, файл уходит в раздел «Дубликаты».
