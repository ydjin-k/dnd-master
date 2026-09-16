# Атрибуция эталона SRD 5.1

`srd-5.1-spell-lists.json` — выдержка списков заклинаний по классам из **System Reference
Document 5.1 издания 2023 года**, распространяемого под **Creative Commons Attribution 4.0
International (CC-BY-4.0)**.

Лицензия требует помещать в работу дословный текст ниже. Он напечатан на первой странице PDF
(раздел «Legal Information», пункт «include the following attribution statement in your own
work») и приводится без изменений:

> This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by
> Wizards of the Coast LLC and available at
> https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under
> the Creative Commons Attribution 4.0 International License available at
> https://creativecommons.org/licenses/by/4.0/legalcode.

Тот же текст лежит в данных правил (`rules/rules.json`, тема `spellcasting-attribution`
раздела «Заклинания») — там его видит игрок. Здесь он находится потому, что вендоринг без
атрибуции рядом с выдержкой нарушает лицензию сам по себе.

## Почему издание 2023 года, а не 2016

`media.wizards.com/2016/downloads/DND/SRD-OGL_V5.1.pdf` — тот же SRD 5.1 по содержанию, но
выпущен под **OGL 1.0a**, и его раздел Product Identity объявляет закрытыми «proper names
(including those used in the names of spells or items)» — то есть ровно имена заклинаний,
которые тут и вендорятся. У издания 2023 года под CC-BY-4.0 такой оговорки нет. Берём его.

## Как получена выдержка

Исходный PDF — `https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf`. В git он **не
кладётся** (`.gitignore`, правило `/*.pdf`): это источник, а не артефакт. Кладётся на диск
рабочего дерева и извлекается одной командой:

```sh
pdftotext -enc UTF-8 SRD_CC_v5.1.pdf srd.txt
```

Дальше выдержка собирается из двух разделов `srd.txt`:

1. **`Spell Descriptions`** (от строки `Spell Descriptions` до строки `Traps`) даёт словарь
   имён и кругов: заголовок заклинания стоит на отдельной строке, а следующая строка —
   `2nd-level evocation` / `Evocation cantrip` (возможен хвост ` (ritual)`). Заголовков 319.
2. **`Spell Lists`** даёт принадлежность классам: восемь разделов `<Класс> Spells`,
   внутри — подзаголовки `Cantrips (0 Level)` и `<N>th Level`, под ними имена заклинаний.

Три ловушки извлечения, из-за которых наивный разбор не работает:

- **Имена в списках идут одной строкой через пробел без разделителей** — `Bless Command Cure
  Wounds Detect Evil and Good …`. Разбить по пробелам нельзя; строка разбирается жадно, самым
  длинным совпадением против словаря из п. 1 (иначе `Mass Cure Wounds` распадётся на
  `Mass` + `Cure Wounds`).
- **Между строками списка попадается верстальный мусор** — `System Reference Document 5.1`,
  голый номер страницы, пустые строки; у следопыта 4 круга `Stoneskin` вынесен разрывом
  колонки на отдельную строку. Поэтому весь блок одного круга склеивается в одну строку, и
  только потом разбирается.
- **Не-ASCII знаки.** Дефисы в PDF — `U+2010`/`U+2011`, между ними попадается мягкий перенос
  `U+00AD` (`2nd-<SHY><U+2010><U+2011>level`), апострофы — `U+2019` (`Hunter’s Mark`). До
  сопоставления всё это нормализуется в ASCII, а повторяющиеся дефисы схлопываются в один.

Проверка, что разбор сошёлся: 319 заголовков в `Spell Descriptions`, 319 имён разобрано в
списках классов, ни одного заголовка без класса и ни одного неразобранного слова.

## Что в выдержке есть и чего нет

Только **имя как в PDF, наш kebab-id, круг и список классов**. Описаний, компонентов,
дистанций, школ и времени сотворения здесь нет и быть не должно: сторож их не сверяет, а
вендорить лишнее — значит тащить в репозиторий текст, который нам не нужен.

`projectOriginal` — белый список **нашего собственного** контента: заклинания, которых в SRD
нет и не должно быть. Сторож `src-tauri/src/spells.rs` пропускает их поимённо, а не по
правилу «чего нет в эталоне — то сойдёт».
