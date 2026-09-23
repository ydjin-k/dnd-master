# GM Engine — концепт и техническая спецификация v0.1

> **Как этот файл живёт в репозитории.** Оригинал написан владельцем продукта
> (`GM_Engine_Concept_v0.1.md`, 01.09.2026) и внесён сюда 16.09.2026 по его решению: документ
> **подстраивается под приложение**, а не наоборот — если что-то в нём мешает удобно лечь на
> существующий код, правится документ. Правки продюсера помечены подзаголовками вида
> «(правка ДД.ММ.ГГГГ)» и не переписывают замысел, а приземляют его на то, что уже написано.
> На 16.09.2026 внесены три: Rules Adapter приземлён на существующие модули (3.1), Actor и
> Threat ссылаются на бестиарий вместо своих статов (4.3, 4.5), разведены дневник кампании и
> технический History Log (29.2).
>
> Работа по движку **на паузе** по решению владельца от 16.09.2026 — карточек по нему не
> заводить до отдельной просьбы.

## 0. Назначение документа

Этот документ описывает автономный офлайн-движок помощника ведущего для приложения в тематике D&D-подобных настольных ролевых игр.

Ключевое ограничение: приложение **не использует нейросеть и не имеет доступа в интернет**. Следовательно, движок не должен зависеть от понимания естественного языка, внешних API или генеративной модели. Все решения должны приниматься через:

- формализованное состояние игры;
- правила;
- таблицы;
- теги;
- шаблоны;
- локальные справочники;
- псевдослучайные броски;
- явный ввод пользователя.

Движок должен работать в двух режимах:

1. **Помощник ведущего** — мастер сохраняет контроль, а приложение отвечает на вопросы, генерирует последствия, NPC, сцены, осложнения, проверки и подсказки.
2. **Частичный эмулятор ведущего** — приложение самостоятельно определяет неизвестные факты мира, развитие сцены и случайные события в рамках формализованных правил.

Идея вопросов «да/нет», вероятности, исключительных результатов и сцен вдохновлена общими принципами Mythic GME, но архитектура ниже является самостоятельной и ориентирована на программную реализацию.

---

# 1. Цели продукта

## 1.1. Основная цель

Создать локальный GM Engine, который способен поддерживать ход приключения без генеративного ИИ и минимизировать необходимость для пользователя самостоятельно придумывать каждое следующее событие.

## 1.2. Что движок должен уметь

Движок должен:

- хранить текущее состояние приключения;
- понимать тип действия через структурированный интерфейс;
- различать правила RPG и неизвестные факты мира;
- выполнять проверки;
- отвечать на вопросы о мире через Оракул;
- генерировать неожиданные события;
- управлять сценами;
- отслеживать NPC, угрозы и сюжетные линии;
- поддерживать исследования;
- помогать с социальными сценами;
- формировать результаты из локальных текстовых шаблонов;
- быть полностью воспроизводимым при заданном random seed;
- работать без сети;
- быть расширяемым через content packs.

## 1.3. Что движок НЕ должен делать

В версии ядра движок не должен:

- пытаться понимать произвольный художественный текст;
- генерировать длинную прозу;
- самостоятельно переписывать правила RPG;
- принимать скрытые решения, которые невозможно объяснить пользователю;
- требовать облачного сервера;
- зависеть от конкретного издания D&D;
- заменять полноценную систему правил боя;
- создавать «интеллект» NPC через машинное обучение.

---

# 2. Основной принцип архитектуры

Каждое действие обрабатывается по цепочке:

**INPUT → CLASSIFY → RESOLVE → CONSEQUENCE → STATE UPDATE → OUTPUT**

### INPUT
Пользователь выбирает действие, цель и контекст через интерфейс.

### CLASSIFY
Движок определяет, какой модуль должен разрешить действие.

### RESOLVE
Выполняется проверка, бросок Оракула или обращение к генератору.

### CONSEQUENCE
Результат переводится в игровые последствия.

### STATE UPDATE
Изменяется состояние мира.

### OUTPUT
Пользователь получает короткое описание результата и, при необходимости, доступные продолжения.

---

# 3. Три главных слоя системы

## 3.1. Rules Adapter

Отвечает за механику конкретной RPG-системы.

Примеры:

- проверки навыков;
- спасброски;
- атаки;
- класс сложности;
- характеристики;
- преимущества/помехи;
- состояние персонажей;
- правила отдыха;
- инициатива.

GM Engine не должен хранить логику конкретного издания внутри ядра. Он вызывает интерфейс Rules Adapter.

Пример:

```text
resolve_skill_check(
    actor = Vizzerin,
    skill = Stealth,
    difficulty = 13,
    modifiers = [...]
)
```

### Приземление на это приложение (правка 16.09.2026)

Rules Adapter здесь **не пишется с нуля** — система правил в приложении уже есть, и адаптер
обязан быть тонкой обёрткой над ней, а не вторым её экземпляром:

| Что нужно движку | Чем это уже закрыто |
|---|---|
| Броски кубиков, разбор выражений вида `2d6+3` | `src-tauri/src/dice.rs` — `roll_expression`, `roll_ability_scores` |
| Модификатор характеристики | `src/ui/characterCreationData.ts` — `abilityMod` |
| Список навыков и привязка навыка к характеристике | там же — `ALL_SKILLS`, `SKILL_ABILITY` |
| Владения навыками и спасбросками персонажа | `Character.skillProficiencies`, `Character.savingThrowProficiencies` (`src/state/types.ts`) |
| Сложность спасброска от заклинания | `characterCreationData.ts` — `spellSaveDc` |
| Бой: инициатива, атака, урон, ход монстра | `src-tauri/src/combat.rs` — `start_combat`, `attack`, `apply_damage`, `cast_spell`, `end_turn`, `monster_auto_turn` |
| Справочник правил SRD 5.1 | `src-tauri/rules/rules.json` через `src-tauri/src/rules.rs` |
| Заклинания | `src-tauri/rules/spells.json` через `src-tauri/src/spells.rs` |
| Листы персонажей | `src-tauri/src/characters.rs`, `src/ui/pages/CharactersPage.tsx` |

**Проверки навыка как отдельной функции сегодня нет** — это единственное, что Rules Adapter
действительно добавляет: собрать `abilityMod` + бонус мастерства, если навык есть в
`skillProficiencies`, бросить через `roll_expression` и сравнить со сложностью. Всё остальное
адаптер только вызывает.

Правило независимости от издания при этом остаётся в силе: ядро движка зовёт адаптер, а не
`rules.json` напрямую. Меняется не принцип, а то, что за адаптером стоит уже написанный код.

## 3.2. GM Engine

Принимает решения, которыми обычно занимается ведущий:

- существует ли неизвестный факт;
- появляется ли осложнение;
- как изменяется сцена;
- активируется ли NPC;
- возникает ли новая угроза;
- меняется ли сюжетная линия;
- когда заканчивается сцена.

## 3.3. World State

Единый источник истины о происходящем.

Все модули читают и изменяют только World State.

---

# 4. Ключевые сущности

## 4.1. CampaignState

Глобальное состояние приключения.

```json
{
  "campaign_id": "cmp_001",
  "system_id": "ruleset_001",  // снято, см. правку ниже
  "seed": 481922,
  "current_scene_id": "scene_007",
  "tension": 3,
  "actors": [],
  "locations": [],
  "facts": [],
  "plot_threads": [],
  "event_history": []
}
```

### `system_id` не заводится (правка 23.09.2026)

**Решение владельца: поля `system_id` в состоянии не будет.** Правило в приложении одно — SRD 5.1,
и второго издания не планируется. Поле, у которого за всё время жизни одно значение, ничего не
различает: оно не выбирает ветку кода, не влияет на загрузку и не проверяется ничем.

Независимость ядра от издания (§3.1) при этом не отменяется и держится по-прежнему тем, что ядро
зовёт Rules Adapter, а не `rules.json` напрямую. Появится второе издание — появится и поле, вместе
со вторым адаптером, который придаст ему смысл.

## 4.2. SceneState

```json
{
  "id": "scene_007",
  "status": "active",
  "location_id": "loc_dungeon_01",
  "objective": "Find a way out",
  "tension": 3,
  "participants": ["pc_vizzerin", "npc_creature_01"],
  "active_threats": ["threat_creature_01"],
  "scene_tags": ["dark", "underground", "unknown"],
  "started_at_turn": 17,
  "resolved_conditions": []
}
```

## 4.3. Actor

Единый объект для персонажей игроков и NPC.

```json
{
  "id": "pc_vizzerin",
  "type": "player_character",
  "name": "Vizzerin",
  "tags": ["elf", "darkvision", "agile"],
  "rules_ref": "character_sheet_01",
  "location_id": "loc_dungeon_01",
  "states": ["hidden"],
  "known_facts": []
}
```

### Ссылка на правила и на бестиарий (правка 16.09.2026)

`rules_ref` для персонажа игрока — это id листа персонажа в приложении.

Для NPC и монстров `rules_ref` — это **id записи бестиария** (`src-tauri/bestiary/bestiary.json`,
поле `id`), и только он. Статы — `maxHp`, `armorClass`, `speedFeet`, `attackBonus`, `damageDice`,
`challengeRating`, `traits`, `actions`, `imageAsset` — **в Actor не копируются**: движок берёт их
из бестиария по ссылке. Иначе в приложении появится вторая копия бестиария, и она разойдётся
с первой при первой же правке монстра.

Пример NPC:

```json
{
  "id": "npc_creature_01",
  "type": "npc",
  "name": "Пещерный падальщик",
  "tags": ["monstrosity", "darkvision"],
  "rules_ref": "carrion-crawler",
  "location_id": "loc_dungeon_01",
  "states": ["unaware"],
  "known_facts": []
}
```

В бою движок не считает сам, а передаёт управление существующему `combat.rs`: `start_combat`
принимает id монстров из бестиария, дальше работают `attack`, `cast_spell`, `monster_auto_turn`.

## 4.4. Location

```json
{
  "id": "loc_dungeon_01",
  "name": "Underground chamber",
  "tags": ["dark", "stone", "underground"],
  "exits": ["exit_corridor_01"],
  "features": ["large_rock", "ceiling_hole"],
  "discovered": true
}
```

## 4.5. Threat

```json
{
  "id": "threat_creature_01",
  "actor_id": "npc_creature_01",
  "level": 2,
  "awareness": "unaware",
  "intent": "search_area",
  "distance": "near",
  "status": "active"
}
```

`actor_id` указывает на Actor, а тот уже несёт ссылку на бестиарий (см. правку в 4.3).
Собственных статов у Threat нет по той же причине.

## 4.6. Fact

Fact — подтверждённый факт мира.

Примеры:

- дверь заперта;
- у комнаты есть второй выход;
- NPC знает имя героя;
- мост разрушен.

```json
{
  "id": "fact_102",
  "subject": "door_03",
  "predicate": "locked",
  "value": true,
  "source": "oracle",
  "certainty": "confirmed"
}
```

После создания Fact повторный Оракул по тому же факту не используется, пока событие явно не изменит состояние.

## 4.7. PlotThread

```json
{
  "id": "thread_01",
  "title": "Find the missing scout",
  "status": "active",
  "priority": 2,
  "progress": 1,
  "tags": ["mystery", "rescue"],
  "linked_entities": ["npc_scout"]
}
```

---

# 5. Action Router

Action Router определяет, какой модуль должен обработать запрос.

## 5.1. Основные типы действий

```text
RULE_CHECK
ORACLE_QUERY
EXPLORE
MOVE
INTERACT
SOCIAL
COMBAT
INVESTIGATE
USE_ITEM
REST
GM_EVENT
SCENE_TRANSITION
```

## 5.2. Правило маршрутизации

### Если результат зависит от способности персонажа
→ Rules Adapter.

Примеры:

- незаметно пройти;
- взобраться;
- открыть замок;
- распознать магию;
- убедить NPC.

### Если вопрос касается неизвестного объективного факта мира
→ Oracle.

Примеры:

- дверь заперта?
- есть ли здесь охрана?
- знает ли трактирщик этого человека?
- существует ли другой проход?

### Если пользователь исследует область без конкретного вопроса
→ Exploration Engine.

### Если сцена должна измениться без прямого действия
→ Event Engine.

---

# 6. Оракул

Оракул разрешает бинарные неизвестные факты.

## 6.1. Шкала вероятности

| Категория | Базовая вероятность «Да» |
|---|---:|
| Почти невозможно | 10% |
| Маловероятно | 30% |
| Равные шансы | 50% |
| Вероятно | 70% |
| Почти наверняка | 90% |

Вероятность выбирается пользователем или вычисляется по тегам контекста.

## 6.2. Результаты

Оракул возвращает один из четырёх результатов:

```text
STRONG_NO
NO
YES
STRONG_YES
```

Базовая модель:

- STRONG_YES: бросок 1–5;
- YES: бросок <= P;
- NO: бросок > P;
- STRONG_NO: бросок 96–100.

При конфликте крайний результат имеет приоритет.

## 6.3. Важное правило

Оракул **не должен использоваться**, если ответ уже присутствует в World State.

Пример:

Если ранее создан факт:

```text
door_03.locked = true
```

вопрос «Дверь заперта?» возвращается из Fact Store без нового броска.

## 6.4. Модификаторы вероятности

Модификаторы не должны быть произвольными.

Рекомендуемая система:

```text
-2 = сильно против
-1 = против
 0 = нейтрально
+1 = в пользу
+2 = сильно в пользу
```

Каждый шаг изменяет категорию вероятности на одну позицию.

Пример:

Базовая вероятность: 50/50.

Контекст:
- крепость охраняется: +1;
- район уже покинут: -1.

Итог: 50/50.

---

# 7. Напряжение сцены

Напряжение — показатель нестабильности текущей ситуации.

Диапазон:

```text
1 — спокойствие
2 — контролируемая ситуация
3 — неопределённость
4 — опасная нестабильность
5 — кризис
```

## 7.1. Что делает напряжение

В v0.1 напряжение влияет только на шанс неожиданного события.

| Напряжение | Шанс события |
|---|---:|
| 1 | 5% |
| 2 | 10% |
| 3 | 15% |
| 4 | 20% |
| 5 | 25% |

Это намеренно отделено от вероятности «Да» Оракула.

## 7.2. Изменение напряжения

После завершения сцены:

- ситуация стала контролируемее → −1;
- существенных изменений нет → 0;
- положение ухудшилось → +1.

Минимум 1, максимум 5.

Дополнительно события могут менять напряжение напрямую.

---

# 8. Event Engine

Event Engine создаёт неожиданные изменения.

Он не генерирует литературный текст. Он сначала создаёт **структурированный Event Intent**.

## 8.1. Формула события

```text
TARGET + CHANGE + INTENSITY + CONTEXT FILTER
```

Пример:

```json
{
  "target": "THREAT",
  "change": "APPROACH",
  "intensity": "NORMAL"
}
```

## 8.2. TARGET

Базовые категории:

1. PLAYER
2. ALLY
3. NPC
4. THREAT
5. LOCATION
6. OBJECT
7. PLOT_THREAD
8. CURRENT_OBJECTIVE
9. ENVIRONMENT
10. NEW_ELEMENT

## 8.3. CHANGE

Базовые операции:

1. APPEAR
2. DISAPPEAR
3. APPROACH
4. WITHDRAW
5. REVEAL
6. HIDE
7. CHANGE_STATE
8. CREATE_PROBLEM
9. CREATE_OPPORTUNITY
10. ESCALATE
11. WEAKEN
12. BLOCK
13. OPEN_PATH
14. MOVE
15. ACTIVATE

## 8.4. Context Filter

Это критически важный модуль.

Пример:

Если:

```text
threat.awareness = unaware
```

то запрещены события:

```text
THREAT attacks player
THREAT chases player
```

но разрешены:

```text
THREAT hears noise
THREAT changes route
THREAT discovers tracks
THREAT approaches hiding place
```

Таким образом движок не создаёт логически невозможные события.

---

# 9. Event Templates

После создания Event Intent выбирается конкретный шаблон.

Пример группы:

```text
TARGET = THREAT
CHANGE = CHANGE_STATE
CONDITION = threat.awareness == unaware
```

Варианты:

1. Угроза замечает косвенный след.
2. Угроза становится настороженной.
3. Угроза меняет маршрут.
4. Угроза останавливается и прислушивается.
5. Угроза начинает осматривать ближайшую область.

Каждый вариант должен содержать машинные эффекты.

Пример:

```json
{
  "id": "threat_notice_trace_01",
  "conditions": [
    "threat.awareness == unaware"
  ],
  "effects": [
    "threat.awareness = suspicious"
  ],
  "text_key": "event.threat.notice_trace"
}
```

---

# 10. Scene Manager

Сцена — основной контейнер игрового времени.

## 10.1. У сцены обязательно есть

- место;
- участники;
- цель или текущий фокус;
- напряжение;
- активные угрозы;
- факты;
- условия завершения.

## 10.2. Создание сцены

```text
create_scene(
    location,
    objective,
    participants,
    initial_tags
)
```

## 10.3. Завершение сцены

Сцена завершается, если:

- выполнена её цель;
- цель стала невозможной;
- персонажи покинули место;
- произошёл значительный временной переход;
- изменился основной конфликт.

## 10.4. Scene Transition

При переходе:

1. закрыть старую сцену;
2. записать outcome;
3. изменить tension;
4. активировать возможные plot threads;
5. проверить delayed events;
6. создать новую SceneState.

---

# 11. Exploration Engine

Предназначен для действий вида:

«Осматриваюсь».
«Исследую комнату».
«Ищу что-нибудь полезное».

## 11.1. Exploration Profile

Каждая локация имеет профиль:

```json
{
  "discovery_slots": {
    "obvious": 2,
    "hidden": 2,
    "secret": 1
  },
  "categories": [
    "exit",
    "object",
    "clue",
    "hazard",
    "creature",
    "environment"
  ]
}
```

## 11.2. Уровни информации

### Obvious
Не требует проверки.

### Hidden
Требует соответствующей проверки RPG.

### Secret
Открывается только при конкретных условиях или высоком результате.

## 11.3. Принцип

Исследование не должно бесконечно создавать новые объекты.

У локации имеется ограниченный Discovery Budget.

---

# 12. NPC Engine

NPC не должен иметь «ИИ». Вместо этого используется конечный автомат поведения.

## 12.1. Минимальные поля NPC

```text
role
attitude
goal
fear
knowledge
resources
awareness
current_intent
```

## 12.2. Attitude

```text
HOSTILE
UNFRIENDLY
NEUTRAL
FRIENDLY
LOYAL
```

## 12.3. Intent

Примеры:

```text
observe
avoid
talk
trade
lie
warn
search
escape
attack
protect
follow
investigate
```

## 12.4. Decision Table

Пример:

```text
IF hostile AND aware AND distance = near
→ attack / threaten / reposition

IF neutral AND approached peacefully
→ talk / observe / leave

IF afraid AND threat > courage
→ escape / surrender / hide
```

Выбор внутри допустимого набора производится случайно с весами.

---

# 13. Social Engine

Социальная сцена разделяется на:

1. намерение игрока;
2. отношение NPC;
3. интересы NPC;
4. RPG-проверку;
5. изменение отношения/состояния.

Пример:

```text
Intent: obtain_information
NPC attitude: neutral
NPC has information: true
Information sensitivity: medium
```

Движок определяет сложность, Rules Adapter выполняет проверку, затем Social Engine применяет outcome.

Важно: успешная проверка не должна заставлять NPC делать логически невозможные вещи.

---

# 14. Plot Thread Engine

Plot Thread — активная сюжетная линия.

Примеры:

- найти пропавшего человека;
- выяснить происхождение артефакта;
- сбежать из подземелья;
- остановить культ.

## 14.1. Состояния

```text
INACTIVE
ACTIVE
ADVANCED
BLOCKED
RESOLVED
FAILED
```

## 14.2. События могут

- продвигать thread;
- создавать препятствие;
- раскрывать clue;
- связывать NPC;
- создавать новую thread;
- закрывать thread.

---

# 15. Clue System

Для расследований нельзя полагаться только на случайность.

Каждая Mystery Thread должна иметь:

```text
core_truth
required_clues
optional_clues
false_leads
reveal_conditions
```

Критически важные подсказки не должны исчезать из-за одного плохого броска.

Провал проверки может:

- замедлить получение подсказки;
- добавить цену;
- вызвать осложнение;
- дать неполную информацию.

---

# 16. Threat Engine

Threat — это не обязательно монстр.

Типы:

```text
CREATURE
ENVIRONMENT
TIME
SOCIAL
RESOURCE
TRAP
PURSUIT
MAGIC
UNKNOWN
```

У угрозы есть:

```text
severity
awareness
distance
progress
trigger
response_table
```

Пример таймера угрозы:

```text
progress 0/4
```

При достижении 4 происходит эскалация.

---

# 17. Combat Integration

GM Engine не должен заменять боевой движок RPG.

Его роль:

- решить, начинается ли бой;
- определить мотивацию противника;
- выбирать поведенческий профиль;
- управлять моралью;
- решать отступление;
- создавать тактические события сцены.

Пример AI-профиля противника:

```text
Brute:
1. Attack nearest enemy
2. Prefer damaged target
3. Do not retreat until morale check fails
```

Это простой rule-based AI.

---

# 18. Template Renderer

Поскольку нейросети нет, весь текст строится из шаблонов.

## 18.1. Пример

```text
"{actor} {movement_success} через {location}. {threat} {awareness_result}."
```

Локализация:

```json
{
  "ru": {
    "movement_success": "бесшумно проходит",
    "awareness_unaware": "не замечает его"
  }
}
```

## 18.2. Три уровня текста

### SYSTEM
«Stealth: SUCCESS»

### SHORT
«Виззерин проходит незамеченным.»

### NARRATIVE
«Виззерин бесшумно скользит вдоль стены и покидает помещение. Существо не замечает движения.»

Все три варианта формируются без ИИ.

---

# 19. Content Packs

Весь контент должен храниться отдельно от движка.

Пример структуры:

```text
/content
    /core
        oracle.json
        event_targets.json
        event_changes.json
    /fantasy
        locations.json
        npc_archetypes.json
        threats.json
        events.json
    /rulesets
        /system_a
        /system_b
```

Это позволит добавлять новые жанры и RPG-системы без изменения ядра.

---

# 20. Условия и теги

Контент должен фильтроваться по тегам.

Пример события:

```json
{
  "requires": ["underground"],
  "forbids": ["safe_zone"],
  "weight": 10
}
```

Если сцена имеет:

```text
underground
dark
ancient
```

событие подходит.

Если присутствует `safe_zone`, оно исключается.

---

# 21. Weighted Random

Все таблицы должны поддерживать веса.

```json
[
  {"id": "nothing", "weight": 40},
  {"id": "clue", "weight": 20},
  {"id": "hazard", "weight": 15},
  {"id": "npc", "weight": 15},
  {"id": "threat", "weight": 10}
]
```

Это позволяет тонко настраивать атмосферу.

---

# 22. Random Seed

Движок должен использовать единый управляемый PRNG.

Обязательно сохранять:

```text
campaign_seed
current_rng_state
```

Преимущества:

- воспроизводимость багов;
- автоматические тесты;
- повтор партии;
- диагностика действий ИИ-агентами разработки.

---

# 23. История решений

Каждое решение записывается.

```json
{
  "turn": 24,
  "type": "oracle",
  "question_key": "door_has_guard",
  "probability": 70,
  "roll": 82,
  "result": "NO",
  "state_changes": []
}
```

Пользователь должен иметь возможность открыть «Почему это произошло?».

---

# 24. Пример обработки тестовой сцены Виззерина

## Шаг 1. Начало

Вход:

```text
Vizzerin fell into an underground chamber.
Action: Look around
```

Scene Manager создаёт:

```text
location = underground_chamber
tension = 3
objective = understand_surroundings
```

Exploration Engine выдаёт очевидные элементы:

```text
ceiling_hole
stone_floor
dark_corridor
large_rock
```

## Шаг 2. Появление существа

Event Engine:

```text
TARGET = THREAT
CHANGE = APPROACH
```

Создаётся:

```text
npc_creature_01
awareness = unaware
location = corridor
intent = enter_room
```

## Шаг 3. Виззерин прячется

Пользователь выбирает:

```text
Action = HIDE
Cover = large_rock
```

Action Router:

```text
HIDE → Rules Adapter → Stealth
```

После успеха:

```text
Vizzerin.hidden = true
creature.awareness = unaware
```

## Шаг 4. Виззерин рассматривает существо

```text
Action = OBSERVE
Target = creature_01
```

Rules Adapter → Perception.

Провал:

```text
creature.identity_known = false
creature.visible_traits += humanoid_shape
```

## Шаг 5. Виззерин уходит

```text
Action = MOVE_STEALTH
Destination = corridor
```

Контекст:

```text
hidden = true
cover_available = true
enemy_awareness = unaware
```

Rules Adapter разрешает Stealth.

Успех:

```text
Vizzerin.location = corridor
Vizzerin.hidden = true
creature.awareness = unaware
```

Никакого понимания естественного языка для этого не требуется.

---

# 25. Состояния осведомлённости

Для скрытности рекомендуется использовать не boolean, а шкалу:

```text
UNAWARE
SUSPICIOUS
AWARE
TRACKING
ENGAGED
```

Пример переходов:

```text
UNAWARE → SUSPICIOUS
SUSPICIOUS → AWARE
AWARE → TRACKING
TRACKING → ENGAGED
```

Это позволяет делать более естественные сцены преследования.

---

# 26. Временные эффекты

Некоторые изменения должны происходить позже.

```json
{
  "event": "guards_arrive",
  "trigger": {
    "type": "turn_count",
    "value": 3
  }
}
```

Другие триггеры:

```text
scene_end
enter_location
leave_location
threat_progress
item_used
npc_dead
thread_resolved
```

---

# 27. Приоритет логики

При выборе результата применять порядок:

1. жёсткое правило системы;
2. подтверждённый Fact;
3. текущее State;
4. условие шаблона;
5. Rules Adapter;
6. Oracle;
7. Weighted Random;
8. fallback.

Это предотвращает противоречия.

---

# 28. Fallback System

Движок никогда не должен зависать из-за отсутствия подходящего контента.

Пример:

```text
No valid event templates found.
```

Fallback:

```text
TARGET = ENVIRONMENT
CHANGE = CHANGE_STATE
```

Нейтральный результат:

«В окружении происходит небольшое изменение.»

В debug режиме выводится причина fallback.

---

# 29. Интерфейс приложения

## 29.1. Основной экран сцены

Рекомендуемые элементы:

```text
[СЦЕНА]
Название / место
Цель
Напряжение

[ДЕЙСТВИЯ]
Проверка
Исследовать
Спросить Оракул
Взаимодействовать
Переместиться
Случайное событие

[АКТИВНО]
NPC
Угрозы
Сюжетные линии
Факты
```

## 29.2. Оракул

```text
Вопрос: [текст для журнала]

Вероятность:
○ 10
○ 30
○ 50
○ 70
○ 90

[БРОСИТЬ]
```

Текст вопроса хранится как журнал, но логика не должна зависеть от его семантического анализа.

### Какой именно журнал (правка 16.09.2026)

В приложении **дневник кампании уже есть** — отдельная вкладка со своей механикой, и в неё
16.09.2026 переехало то, что игрок писал руками в старом разделе приключений. Второго
обращённого к игроку журнала движок не заводит: всё, что достойно памяти по сюжету — вопрос
Оракулу и его ответ, выпавшее событие, смена сцены — пишется в **дневник кампании**.

Это не отменяет History Log из разделов 34-35: тот — технический журнал транзакций ради
Undo/Redo, он живёт внутри движка, игроку не показывается и дневником не является. Две разные
вещи, и путать их не надо:

| | Кому | Зачем | Где живёт |
|---|---|---|---|
| Дневник кампании | игроку | память о сюжете | существующая вкладка «Дневник» |
| History Log | движку | откат состояния | внутри движка, наружу не выходит |


---

# 30. Режимы управления

## ASSISTED GM

Приложение предлагает, мастер подтверждает.

Пример:

```text
Предлагаемая вероятность: 70%
[Принять] [Изменить]
```

## AUTO GM

Приложение выбирает параметры из State и тегов.

Если уверенность низкая:

```text
Невозможно однозначно определить вероятность.
Выберите:
30 / 50 / 70
```

Это лучше, чем скрытая случайная догадка.

---

# 31. Confidence System

Автоматические решения должны иметь confidence.

```text
HIGH
MEDIUM
LOW
```

Пример:

```text
Есть теги:
fortress
guarded
night

Вопрос:
guard_present

Confidence = HIGH
Probability = 70%
```

Если нет подходящих правил:

```text
Confidence = LOW
```

→ запросить выбор пользователя.

---

# 32. Команды движка

Минимальный внутренний API:

```text
create_campaign()
create_scene()
end_scene()

perform_action()
resolve_rule_check()

ask_oracle()
trigger_event()

create_actor()
update_actor()

create_fact()
update_fact()

create_plot_thread()
advance_plot_thread()

enter_location()
leave_location()

save_game()
load_game()
```

---

# 33. Рекомендуемый Result Object

Каждый модуль возвращает одинаковую структуру.

```json
{
  "success": true,
  "result_type": "RULE_CHECK_SUCCESS",
  "summary_key": "stealth.success",
  "rolls": [
    {
      "die": "d20",
      "value": 14,
      "modifier": 5,
      "total": 19,
      "target": 13
    }
  ],
  "state_changes": [
    {
      "path": "actors.pc_vizzerin.states",
      "operation": "add",
      "value": "hidden"
    }
  ],
  "generated_events": [],
  "choices": []
}
```

Это сильно упростит интеграцию UI.

---

# 34. State Mutation

Модули не должны напрямую мутировать объекты.

Лучше использовать State Mutation Queue:

```text
Engine calculates result
↓
creates mutations
↓
Validator checks mutations
↓
State Manager applies mutations
↓
History Logger records transaction
```

Это позволяет сделать Undo.

---

# 35. Undo / Redo

Для помощника ведущего это важная функция.

Хранить изменения как транзакции:

```text
Transaction 441
+ hidden
- location_room
+ location_corridor
```

Можно отменить весь результат действия одним нажатием.

---

# 36. Save Format

Рекомендуется JSON с версией схемы.

```json
{
  "schema_version": 1,
  "engine_version": "0.1.0",
  "content_version": "0.1.0"
}
```

При обновлении приложения используется migration pipeline.

### Версия схемы снята (правка 23.09.2026)

**Решение владельца: `schema_version` не заводить.** Миграции в приложении уже работают и держатся
ФОРМОЙ полей, а не номером: `#[serde(default)]` на новом поле, `#[serde(alias = "knownSpells")]` на
переименованном, плюс точечные `migrate_legacy_gold`, `migrate_legacy_spell_slots`,
`migrate_legacy_adventure_log` в `storage.rs`. Этим приёмом уже пережиты и переименование полей, и
снос целого движка приключения.

Номер версии стал бы вторым владельцем ответа «какой это формат»: форма полей говорит одно, число
в шапке — другое, и разойдутся они при первом же забытом инкременте. `engine_version` и
`content_version` снимаются по той же причине.

Раздел оставлен в документе, чтобы следующий читатель не завёл версию заново, не зная, что её уже
обсуждали.

---

# 37. Валидация

Перед применением события:

```text
Entity exists?
Location exists?
Conditions valid?
State transition allowed?
Required tags present?
Forbidden tags absent?
```

Если нет — reroll внутри допустимого пула.

Количество попыток ограничить, например 10.

После этого fallback.

---

# 38. Отладочный режим

Обязательно добавить Developer/Debug Mode.

Он должен показывать:

```text
Action Router → ORACLE
Base probability → 50
Modifier guarded → +1
Final probability → 70
Roll → 82
Result → NO
Event roll → 91
No event
```

Для интеграции и балансировки это критически важно.

---

# 39. Телеметрия без интернета

Даже полностью офлайн можно вести локальную статистику:

```text
oracle_calls
yes_rate
event_rate
scene_length
fallback_count
reroll_count
template_usage
```

Экспортировать вручную в JSON.

Это позволит анализировать баланс.

---

# 40. Тестирование

## Unit Tests

Проверять каждый модуль отдельно.

Пример:

```text
Given:
probability = 70
roll = 42

Expected:
YES
```

## State Tests

```text
Given:
enemy.awareness = unaware

Event:
attack_player

Expected:
REJECT
```

## Seed Tests

При одинаковом seed и одинаковом input результат обязан совпадать.

## Long Simulation

Автоматически запускать 10 000–100 000 сцен и проверять:

- частоты событий;
- зацикливания;
- невозможные переходы;
- слишком частые угрозы;
- отсутствие валидных шаблонов.

---

# 41. MVP v0.1

В первую рабочую версию должны войти только:

1. Campaign State.
2. Scene State.
3. Actor State.
4. Fact Store.
5. Action Router.
6. Rules Adapter interface.
7. Oracle.
8. Tension.
9. Event Engine.
10. 50–100 event templates.
11. Basic Exploration.
12. Basic NPC state.
13. Template Renderer.
14. Save/Load.
15. History Log.
16. Debug Mode.

Не добавлять на первом этапе:

- сложные квестовые генераторы;
- процедурные города;
- генератор кампаний;
- сложную экономику;
- автоматическое написание диалогов;
- сотни классов NPC.

---

# 42. MVP v0.2

После стабильного ядра:

- Plot Threads;
- NPC Intent;
- Threat Progress;
- delayed events;
- social engine;
- clue system;
- expanded exploration;
- weighted context tables.

---

# 43. MVP v0.3

После тестирования:

- полноценный Auto GM Mode;
- поведенческие профили врагов;
- генерация подземелий;
- путешествия;
- погода;
- лагерь/отдых;
- фракции;
- отношения NPC;
- расширенные сюжетные события.

---

# 44. Критерии готовности ядра

GM Engine v0.1 считается работоспособным, если он может провести тестовую сцену типа Виззерина без ручного изменения внутренних данных разработчиком.

Обязательный сценарий:

1. создать сцену;
2. создать локацию;
3. осмотреться;
4. добавить угрозу;
5. выполнить скрытность;
6. изменить awareness угрозы;
7. выполнить Perception;
8. переместить персонажа;
9. сохранить результат;
10. восстановить состояние после загрузки;
11. повторить сцену с тем же seed и получить тот же результат.

---

# 45. Главное архитектурное правило

Движок не должен пытаться «быть умным».

Он должен быть:

**предсказуемым, объяснимым, контекстным и расширяемым.**

Иллюзия разумного ведущего возникает не из генеративного текста, а из правильного сочетания:

```text
World State
+ Rules
+ Context Filters
+ Weighted Random
+ Consequences
+ Persistent Memory
```

Именно это должно стать фундаментом приложения.
