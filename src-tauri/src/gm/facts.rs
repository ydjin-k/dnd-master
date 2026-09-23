//! Fact Store — подтверждённые факты мира (§4.6, §6.3, §27).
//!
//! Факт — это то, что в мире УЖЕ решено: дверь заперта, у комнаты есть второй
//! выход, трактирщик знает героя. Хранилище одно и это поле состояния
//! (`EngineState.facts`); второго файла и второго реестра нет.
//!
//! **Ради чего модуль существует — поиск по паре «субъект + предикат».** Им
//! пользуется Оракул: §6.3 запрещает бросать, если ответ уже есть. Без этого
//! поиска движок перебрасывал бы решённое и противоречил игроку — минуту назад
//! дверь была заперта, теперь нет.
//!
//! **Пара «субъект + предикат» — это личность факта.** Двух ответов на один
//! вопрос в состоянии быть не может: повторное создание — ОТКАЗ валидатора, а
//! не второй факт и не молчаливая перезапись. Изменение — отдельное намерение
//! `update_fact`, потому что §4.6 говорит именно так: после создания факт не
//! перепроверяется, пока событие явно не изменит состояние. Удаления нет вовсе.

use serde::{Deserialize, Serialize};

use crate::model::CampaignState;
use crate::storage::generate_id;

use super::mutate::{self, Mutation};
use super::result::ResultObject;
use super::state::EngineState;

/// Откуда факт взялся (§4.6). Нужен не для красоты: увидев на панели
/// «Активно» факт с источником `oracle`, мастер знает, что это решил бросок, а
/// не он сам.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FactSource {
    Oracle,
    Exploration,
    Event,
    Master,
}

/// Достоверность (§4.6). Шкалы нет намеренно: концепт даёт одно значение
/// `confirmed`, и перечисление из одного варианта — честный способ сохранить
/// форму §4.6, не выдумывая градаций, которых в v0.1 нет.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Certainty {
    Confirmed,
}

/// Факт мира (§4.6). `value` двоичное: Оракул разрешает бинарные неизвестные,
/// и других фактов в v0.1 не бывает.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    pub id: String,
    pub subject: String,
    pub predicate: String,
    pub value: bool,
    pub source: FactSource,
    pub certainty: Certainty,
}

/// Ключ факта в одном месте.
///
/// Приведение к нижнему регистру — не косметика: без него `door_03.locked` и
/// `Door_03.Locked` стали бы двумя фактами об одном и том же, то есть ровно тем
/// противоречием, от которого §6.3 и написан. Правило живёт здесь одно, и
/// поиск, и создание зовут его.
fn key(text: &str) -> String {
    text.trim().to_lowercase()
}

/// Поиск по паре «субъект + предикат» — то, ради чего модуль существует.
pub fn find<'a>(engine: &'a EngineState, subject: &str, predicate: &str) -> Option<&'a Fact> {
    let (subject, predicate) = (key(subject), key(predicate));
    engine
        .facts()
        .iter()
        .find(|fact| fact.subject == subject && fact.predicate == predicate)
}

/// Собрать факт, не записывая его. Нужно тем, кто кладёт факт в СВОЮ очередь
/// мутаций одной транзакцией со своим решением — так делает Оракул (§6.3: факт
/// и бросок в одной транзакции, ADR раздел 1).
pub fn new_fact(subject: &str, predicate: &str, value: bool, source: FactSource) -> Fact {
    Fact {
        id: generate_id(),
        subject: key(subject),
        predicate: key(predicate),
        value,
        source,
        certainty: Certainty::Confirmed,
    }
}

/// Создать факт. Пара уже занята — отказ; менять существующий факт можно только
/// `update_fact`, и это разные намерения, а не два способа сделать одно.
pub fn create_fact(
    campaign: &mut CampaignState,
    subject: String,
    predicate: String,
    value: bool,
    source: FactSource,
) -> Result<ResultObject, String> {
    let engine = super::engine_mut(campaign);
    let fact = new_fact(&subject, &predicate, value, source);
    let trace = vec![
        "Fact Store → CREATE_FACT".into(),
        format!("{}.{} → {} (§4.6)", fact.subject, fact.predicate, fact.value),
    ];

    let transaction = mutate::apply(engine, "create_fact", vec![Mutation::FactCreated(fact)])?;

    Ok(ResultObject::success("FACT_CREATED", "fact.created")
        .with_changes(transaction.mutations().to_vec())
        .with_trace(trace))
}

/// Изменить значение известного факта (§4.6: «пока событие явно не изменит
/// состояние»). Факта нет — отказ: изменять нечего, а создавать здесь значило
/// бы завести второй путь создания.
pub fn update_fact(
    campaign: &mut CampaignState,
    subject: String,
    predicate: String,
    value: bool,
    source: FactSource,
) -> Result<ResultObject, String> {
    let engine = super::engine_mut(campaign);
    let known = find(engine, &subject, &predicate)
        .ok_or_else(|| format!("факта {}.{} нет — изменять нечего", key(&subject), key(&predicate)))?;
    let (id, was) = (known.id.clone(), known.value);

    let trace = vec![
        "Fact Store → UPDATE_FACT".into(),
        format!("{}.{}: {was} → {value} (§4.6)", key(&subject), key(&predicate)),
    ];
    let transaction = mutate::apply(
        engine,
        "update_fact",
        vec![Mutation::FactUpdated { id, value, source }],
    )?;

    Ok(ResultObject::success("FACT_UPDATED", "fact.updated")
        .with_changes(transaction.mutations().to_vec())
        .with_trace(trace))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn campaign() -> CampaignState {
        CampaignState {
            id: "campaign-1".into(),
            campaign_name: "Проверка".into(),
            ..Default::default()
        }
    }

    fn facts(campaign: &CampaignState) -> &[Fact] {
        campaign.engine.as_ref().expect("движок завёлся").facts()
    }

    #[test]
    fn a_fact_is_created_found_by_its_pair_and_changed_by_update() {
        let mut campaign = campaign();
        create_fact(&mut campaign, "door_03".into(), "locked".into(), true, FactSource::Master)
            .expect("первый факт создаётся");

        let engine = campaign.engine.as_ref().unwrap();
        let found = find(engine, "door_03", "locked").expect("факт ищется по паре");
        assert!(found.value);
        assert_eq!(found.source, FactSource::Master);
        assert_eq!(found.certainty, Certainty::Confirmed);
        assert!(find(engine, "door_03", "trapped").is_none(), "чужой предикат не находится");
        assert!(find(engine, "door_04", "locked").is_none(), "чужой субъект не находится");

        update_fact(&mut campaign, "door_03".into(), "locked".into(), false, FactSource::Event)
            .expect("известный факт меняется");
        let found = find(campaign.engine.as_ref().unwrap(), "door_03", "locked").unwrap();
        assert!(!found.value, "значение изменилось");
        assert_eq!(found.source, FactSource::Event, "источник изменения виден");
        assert_eq!(facts(&campaign).len(), 1, "изменение не заводит второй факт");
    }

    /// ОТРИЦАТЕЛЬНАЯ ПРОБА карточки: два факта с одной парой «субъект +
    /// предикат» — это два ответа на один вопрос, ровно тот класс, ради
    /// которого §6.3 написан.
    ///
    /// Со снятой починкой (убрать из `mutate::validate` ветку
    /// `Mutation::FactCreated`, где ищется существующая пара) краснеет строка
    /// «повторное создание обязано быть отказом»: в состоянии оказываются два
    /// факта об одной двери с разными значениями, и какой из них правда —
    /// не решить уже никому.
    #[test]
    fn creating_the_same_fact_twice_is_refused_and_leaves_exactly_one_fact() {
        let mut campaign = campaign();
        create_fact(&mut campaign, "door_03".into(), "locked".into(), true, FactSource::Oracle)
            .unwrap();
        let turn = campaign.engine.as_ref().unwrap().turn();

        let refused = create_fact(
            &mut campaign,
            "door_03".into(),
            "locked".into(),
            false,
            FactSource::Master,
        );

        assert!(refused.is_err(), "повторное создание обязано быть отказом");
        assert_eq!(facts(&campaign).len(), 1, "факт остался один");
        assert!(facts(&campaign)[0].value, "и это ПЕРВЫЙ факт, не перезаписанный вторым");
        assert_eq!(
            campaign.engine.as_ref().unwrap().turn(),
            turn,
            "отклонённое действие — не транзакция и не ход"
        );
    }

    /// Регистр и пробелы не заводят второго факта об одном и том же.
    #[test]
    fn the_same_pair_in_another_case_is_the_same_fact() {
        let mut campaign = campaign();
        create_fact(&mut campaign, "Door_03".into(), " Locked ".into(), true, FactSource::Master)
            .unwrap();

        let engine = campaign.engine.as_ref().unwrap();
        assert!(find(engine, "door_03", "locked").is_some(), "ищется в нижнем регистре");
        assert!(
            create_fact(&mut campaign, "door_03".into(), "locked".into(), false, FactSource::Master)
                .is_err(),
            "и повторное создание в другом регистре — тот же отказ"
        );
    }

    #[test]
    fn a_fact_without_a_subject_or_a_predicate_is_refused() {
        let mut campaign = campaign();
        assert!(
            create_fact(&mut campaign, "  ".into(), "locked".into(), true, FactSource::Master)
                .is_err()
        );
        assert!(
            create_fact(&mut campaign, "door_03".into(), " ".into(), true, FactSource::Master)
                .is_err()
        );
        assert!(campaign.engine.as_ref().unwrap().facts().is_empty());
    }

    #[test]
    fn updating_a_fact_nobody_ever_stated_is_refused() {
        let mut campaign = campaign();
        assert!(
            update_fact(&mut campaign, "door_03".into(), "locked".into(), true, FactSource::Event)
                .is_err(),
            "изменять нечего, а создавать здесь нельзя — это второй путь создания"
        );
        assert!(campaign.engine.as_ref().unwrap().facts().is_empty());
    }

    /// Факты — поле состояния, значит они переживают круг через файл вместе с
    /// ним, и отдельного хранилища для этого не нужно.
    #[test]
    fn facts_survive_a_round_trip_through_the_save_file() {
        let mut campaign = campaign();
        create_fact(&mut campaign, "door_03".into(), "locked".into(), true, FactSource::Oracle)
            .unwrap();
        create_fact(&mut campaign, "room_01".into(), "second_exit".into(), false, FactSource::Master)
            .unwrap();

        let raw = serde_json::to_string(&campaign).unwrap();
        let read: CampaignState = serde_json::from_str(&raw).unwrap();

        assert_eq!(read.engine, campaign.engine);
        assert_eq!(facts(&read).len(), 2);
        let engine = read.engine.as_ref().unwrap();
        assert!(find(engine, "door_03", "locked").unwrap().value);
        assert!(!find(engine, "room_01", "second_exit").unwrap().value);
    }

    /// Имена полей читает фронт (панель «Активно») — по именам из §4.6.
    #[test]
    fn fact_field_names_match_the_frontend_type() {
        let json = serde_json::to_value(new_fact("door_03", "locked", true, FactSource::Oracle))
            .unwrap();
        for field in ["id", "subject", "predicate", "value", "source", "certainty"] {
            assert!(json.get(field).is_some(), "фронт читает {field}");
        }
        assert_eq!(json["source"], "oracle");
        assert_eq!(json["certainty"], "confirmed");
    }

    /// Дневник кампании Fact Store не трогает — как и весь движок (решение
    /// владельца 23.09.2026).
    #[test]
    fn creating_facts_never_writes_a_line_into_the_campaign_journal() {
        let mut campaign = campaign();
        create_fact(&mut campaign, "door_03".into(), "locked".into(), true, FactSource::Master)
            .unwrap();
        update_fact(&mut campaign, "door_03".into(), "locked".into(), false, FactSource::Event)
            .unwrap();
        assert!(campaign.journal.is_empty());
    }
}
