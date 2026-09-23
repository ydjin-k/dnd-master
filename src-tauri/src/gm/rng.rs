//! Единый управляемый ГСЧ кампании (§22, §44 шаг 11).
//!
//! **Два владельца, и они разные.** Грамматику выражения кубиков (`2d6+3`,
//! `1d20adv`) знает `dice.rs` и только он: `parse` там приватна, а сюда
//! выведена не она, а источник случайности — `dice::roll_expression_with`.
//! Случайность движка живёт здесь: `seed` и `rng_state` — поля `EngineState`,
//! и двигает их один этот файл. Второй грамматики в проекте нет.
//!
//! **Граница узкая, и это решено.** ГСЧ кампании обслуживает решения движка.
//! Вкладка «Кубики», `combat.rs`, генератор событий и безумие остаются на
//! `thread_rng` — поэтому «тот же сид — тот же результат» НЕ покрывает боевую
//! часть (ADR 0001, раздел 6). Расширение детерминизма на всё приложение —
//! отдельная XL и решение владельца.
//!
//! **Почему `rng_state` — один `u64`.** Состояние `StdRng` не сериализуется,
//! поэтому в сохранении живёт одно число, от которого поток пересеивается на
//! каждом обращении. Альтернатива «хранить счётчик бросков и проигрывать серию
//! заново» стоит O(n) на бросок и растёт без предела — не взята.

use rand::{Rng, RngCore, SeedableRng};
use rand::rngs::StdRng;
use serde::{Deserialize, Serialize};

use crate::dice::{self, RollResult};

use super::mutate::Mutation;
use super::state::EngineState;

/// Сид новой кампании. Зовётся ровно из одного места — `EngineState::default`,
/// то есть из единственного момента рождения движка, — и больше не зовётся
/// никогда: сид не меняется ничем.
///
/// Верхняя граница — не суеверие. Сид показывается игроку на отладочном экране
/// и должен читаться и произноситься вслух («повтори с сидом 481922»), поэтому
/// берутся девять знаков, а не все 64 бита. Воспроизводимость от этого не
/// страдает: различимых кампаний остаётся миллиард.
const SEED_CEILING: u64 = 1_000_000_000;

pub fn new_campaign_seed() -> u64 {
    rand::thread_rng().gen_range(0..SEED_CEILING)
}

/// Курсор потока: состояние и число уже сделанных обращений.
///
/// `draws` не выводится из `state` и не живёт вторым счётчиком чего-то ещё:
/// это ответ на вопрос «какое это по счёту обращение к ГСЧ», без которого
/// отладочный экран не может показать «сид 481922, обращение №14», а значит
/// §44 шаг 11 нечем проверить глазами.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RngCursor {
    #[serde(with = "crate::gm::state::u64_text")]
    pub state: u64,
    #[serde(with = "crate::gm::state::u64_text")]
    pub draws: u64,
}

/// Одно обращение к ГСЧ — и единственное место, где поток двигается.
///
/// Всё, что берёт числа из кампании, проходит здесь: иначе «как двигается
/// поток» оказалось бы написано дважды и разъехалось бы на первой правке.
fn advance<T>(
    cursor: &mut RngCursor,
    take: impl FnOnce(&mut StdRng) -> Result<T, String>,
) -> Result<(T, u64), String> {
    let mut stream = StdRng::seed_from_u64(cursor.state);
    let taken = take(&mut stream)?;
    // Следующее состояние берётся из того же потока: разбор выражения уже
    // вытянул из него сколько нужно, и продолжение зависит от всего, что
    // случилось, — то есть последовательность не ходит по кругу.
    cursor.state = stream.next_u64();
    cursor.draws += 1;
    Ok((taken, cursor.draws))
}

/// Сырое число из потока кампании. Нужно тем решениям движка, у которых нет
/// выражения кубиков (взвешенный выбор §21, например). Обращение считается так
/// же, как у броска.
///
/// `allow(dead_code)`: в этой пачке бросают выражением, а сырое число заведено
/// потому, что ADR 0001 называет `next_u64` в составе `gm/rng.rs` и следующий
/// же модуль (§21) будет брать числа именно так.
#[allow(dead_code)]
pub fn next_u64(cursor: &mut RngCursor) -> u64 {
    advance(cursor, |stream| Ok(stream.next_u64()))
        .expect("взять число из потока нельзя не суметь")
        .0
}

/// Бросок движка: грамматика — из `dice.rs`, случайность — из курсора.
/// Разобрать не удалось — курсор НЕ двигается: несостоявшийся бросок не тратит
/// поток, иначе два прогона с одним сидом разошлись бы на опечатке.
pub fn roll(cursor: &mut RngCursor, expr: &str) -> Result<(RollResult, u64), String> {
    advance(cursor, |stream| dice::roll_expression_with(expr, stream))
}

/// Бросающий модуль берёт курсор из состояния, бросает сколько нужно и отдаёт
/// ОДНУ мутацию на всё обращение. Сам он не пишет ничего: запись в
/// `EngineState` идёт единственным путём — `mutate::apply` (§34).
///
/// Ради этого разведения курсор и сделан значением: пока решение считается, в
/// состоянии не меняется ни бита, и отклонённая очередь мутаций не оставляет
/// после себя съеденных чисел.
pub struct Roller {
    start: RngCursor,
    cursor: RngCursor,
}

impl Roller {
    pub fn of(engine: &EngineState) -> Self {
        let cursor = engine.rng_cursor();
        Roller { start: cursor, cursor }
    }

    /// Бросок по выражению. Возвращает результат и номер обращения — номер
    /// уезжает в `trace`, потому что без него «тот же сид» непроверяем.
    pub fn roll(&mut self, expr: &str) -> Result<(RollResult, u64), String> {
        roll(&mut self.cursor, expr)
    }

    /// Мутация продвижения потока — или `None`, если не бросали ни разу.
    /// `None` здесь не формальность: §6.3 требует случая «броска не было», и
    /// тогда в очередь не должно лечь пустое продвижение ГСЧ.
    pub fn advanced(&self) -> Option<Mutation> {
        (self.cursor.draws > self.start.draws).then_some(Mutation::RngAdvanced(self.cursor))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gm::mutate;
    use crate::model::CampaignState;

    /// Прогнать серию бросков от заданного сида — ровно тем путём, которым
    /// будет бросать Оракул.
    fn series(seed: u64, expr: &str, count: usize) -> Vec<i32> {
        let mut cursor = RngCursor { state: seed, draws: 0 };
        (0..count)
            .map(|_| roll(&mut cursor, expr).unwrap().0.total)
            .collect()
    }

    /// Проба на воспроизводимость (§44 шаг 11): 1000 бросков `1d20` с одного
    /// сида повторяются число в число, с другого — расходятся.
    ///
    /// Отрицательная проба: вернуть в `advance` посев от постоянного значения
    /// (`StdRng::from_entropy()` вместо `seed_from_u64(cursor.state)`) —
    /// краснеет строка «тот же сид обязан дать ту же серию».
    #[test]
    fn the_same_seed_replays_a_thousand_rolls_number_for_number() {
        let first = series(481_922, "1d20", 1000);
        let again = series(481_922, "1d20", 1000);
        let other = series(481_923, "1d20", 1000);

        assert_eq!(first, again, "тот же сид обязан дать ту же серию");
        assert_ne!(first, other, "другой сид обязан дать другую серию");
        assert_eq!(first.len(), 1000);
    }

    /// Серия не выродилась: 1000 бросков `1d20` дают и единицы, и двадцатки, и
    /// не стоят на одном числе. Без этого «воспроизводимо» могло бы означать
    /// «всегда 7».
    #[test]
    fn a_thousand_rolls_from_one_seed_are_not_degenerate() {
        let rolls = series(481_922, "1d20", 1000);

        assert!(rolls.iter().all(|&v| (1..=20).contains(&v)), "все броски в границах кубика");
        let distinct: std::collections::BTreeSet<i32> = rolls.iter().copied().collect();
        assert_eq!(distinct.len(), 20, "встречаются все 20 значений");
        assert!(rolls.contains(&1), "крайнее значение 1 встречается");
        assert!(rolls.contains(&20), "крайнее значение 20 встречается");
    }

    /// Сид рождается вместе с движком и у двух кампаний разный — иначе все
    /// кампании играли бы одну и ту же партию.
    #[test]
    fn two_fresh_campaigns_get_different_seeds() {
        let a = EngineState::default();
        let b = EngineState::default();
        assert_ne!(a.seed(), b.seed());
        assert_eq!(a.rng_cursor().state, a.seed(), "поток начинается с сида");
        assert_eq!(a.rng_cursor().draws, 0, "обращений ещё не было");
    }

    /// Проба на переживание загрузки: сохранить после N бросков, загрузить,
    /// бросить ещё — числа ПРОДОЛЖАЮТ ту же последовательность, а не начинают
    /// её заново. Это и ловит потерю `rng_state`.
    ///
    /// Отрицательная проба: убрать `rng_state` из сериализации `EngineState`
    /// (`#[serde(skip)]`) — краснеет строка «после загрузки поток продолжается»:
    /// загруженная кампания начинает серию с начала.
    #[test]
    fn the_rng_stream_continues_after_a_save_and_load_instead_of_starting_over() {
        let mut campaign = CampaignState {
            id: "campaign-1".into(),
            campaign_name: "Проверка".into(),
            ..Default::default()
        };
        let engine = crate::gm::engine_mut(&mut campaign);
        let seed = engine.seed();

        // Три обращения, каждое — своей транзакцией, как у настоящего решения.
        let before = roll_through_mutate(engine, 3);

        let raw = serde_json::to_string(&campaign).unwrap();
        let mut loaded: CampaignState = serde_json::from_str(&raw).unwrap();
        let engine = crate::gm::engine_mut(&mut loaded);

        assert_eq!(engine.seed(), seed, "сид переживает загрузку и не меняется");
        assert_eq!(engine.rng_cursor().draws, 3, "число обращений переживает загрузку");

        let after = roll_through_mutate(engine, 3);
        let continuous = series(seed, "1d20", 6);

        assert_eq!(before, continuous[..3], "до сохранения — начало серии");
        assert_eq!(after, continuous[3..], "после загрузки поток продолжается");
    }

    /// Пишет ли бросок в состояние ЧЕРЕЗ `mutate::apply` — проверяется тем, что
    /// другого пути у пробы нет: `advance_rng` требует `WritePermit`.
    fn roll_through_mutate(engine: &mut EngineState, times: usize) -> Vec<i32> {
        (0..times)
            .map(|_| {
                let mut roller = Roller::of(engine);
                let (rolled, _) = roller.roll("1d20").unwrap();
                mutate::apply(engine, "roll", vec![roller.advanced().unwrap()]).unwrap();
                rolled.total
            })
            .collect()
    }

    /// Отказ валидатора на откат потока. Перемотать ГСЧ назад — значит выдать
    /// уже выданные числа второй раз; это тот же класс, что «переспросить
    /// Оракула» из §6.3, и закрыт он в одном месте.
    #[test]
    fn rewinding_the_rng_stream_is_refused_by_the_validator() {
        let mut engine = EngineState::default();
        let start = engine.rng_cursor();
        roll_through_mutate(&mut engine, 2);

        let refused = mutate::apply(&mut engine, "roll", vec![Mutation::RngAdvanced(start)]);
        assert!(refused.is_err(), "откат потока обязан быть отклонён");
        assert_eq!(engine.rng_cursor().draws, 2, "курсор не сдвинулся назад");

        let standing = engine.rng_cursor();
        let standing_still = mutate::apply(&mut engine, "roll", vec![Mutation::RngAdvanced(standing)]);
        assert!(standing_still.is_err(), "продвижение на ноль обращений — не мутация");
    }

    /// Несостоявшийся бросок не тратит поток: иначе два прогона с одним сидом
    /// разошлись бы на опечатке в выражении.
    #[test]
    fn an_unparsable_expression_does_not_move_the_cursor() {
        let mut cursor = RngCursor { state: 7, draws: 0 };
        assert!(roll(&mut cursor, "2х6").is_err());
        assert_eq!(cursor, RngCursor { state: 7, draws: 0 });
    }

    /// Грамматика — чужая и целиком: движок не знает, что такое `adv`, и
    /// узнавать не должен. Проба сторожит, что выражение действительно уходит
    /// в `dice.rs`, а не разбирается здесь по второму разу.
    #[test]
    fn the_engine_roll_understands_the_grammar_of_dice_rs_and_not_its_own() {
        let mut cursor = RngCursor { state: 481_922, draws: 0 };

        let (flat, _) = roll(&mut cursor, "2d6+3").unwrap();
        assert_eq!(flat.rolls.len(), 2);
        assert_eq!(flat.modifier, 3);
        assert_eq!(flat.total, flat.rolls.iter().sum::<i32>() + 3);

        let (adv, _) = roll(&mut cursor, "1d20adv").unwrap();
        assert!(adv.dropped.is_some(), "преимущество разбирает dice.rs, а не движок");
    }

    /// Номер обращения растёт на единицу за бросок, сколько бы кубиков в
    /// выражении ни было: «обращение» — это обращение к ГСЧ, а не кубик.
    #[test]
    fn one_roll_is_one_addressing_of_the_rng_however_many_dice_it_has() {
        let mut cursor = RngCursor { state: 481_922, draws: 0 };
        assert_eq!(roll(&mut cursor, "10d6").unwrap().1, 1);
        assert_eq!(roll(&mut cursor, "1d20").unwrap().1, 2);

        // Сырое число — тоже обращение, и тоже воспроизводимое.
        let mut raw = RngCursor { state: 99, draws: 5 };
        let value = next_u64(&mut raw);
        assert_eq!(raw.draws, 6);
        assert_eq!(value, next_u64(&mut RngCursor { state: 99, draws: 0 }));
    }
}
