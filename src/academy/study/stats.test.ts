import { describe, expect, it } from 'vitest';
import { dailyCounts, forecast, loadWarning, mastery, secondsPerCard, streak, trueRetention, weakTopics, type CardStat, type ReviewLog } from './stats';

const today = new Date(2026, 10, 10, 18);
const at = (dayOffset: number, h = 10) => new Date(2026, 10, 10 + dayOffset, h).toISOString();
const rv = (o: Partial<ReviewLog>): ReviewLog => ({ rating: 3, state: 2, reviewed_at: at(0), duration_ms: 8000, topic_id: 't1', ...o });

describe('estadísticas', () => {
  it('cuenta respuestas por día, con hoy al final', () => {
    const d = dailyCounts([rv({}), rv({ rating: 1 }), rv({ reviewed_at: at(-2) })], 3, today);
    expect(d.map((x) => [x.n, x.again])).toEqual([[1, 0], [0, 0], [2, 1]]);
  });

  it('previsión: las atrasadas van a hoy; ni nuevas ni apartadas', () => {
    const cards: CardStat[] = [
      { topic_id: 't', state: 2, due: at(-5), stability: 3, lapses: 0 },
      { topic_id: 't', state: 2, due: at(1), stability: 3, lapses: 0 },
      { topic_id: 't', state: 2, due: at(1), stability: 3, lapses: 0, suspended: true },
      { topic_id: 't', state: 0, due: at(0), stability: 0, lapses: 0 },
      { topic_id: 't', state: 2, due: at(30), stability: 40, lapses: 0 },
    ];
    expect(forecast(cards, 3, today).map((d) => d.n)).toEqual([1, 1, 0]);
  });

  it('retención real solo con tarjetas que ya estaban en repaso', () => {
    expect(trueRetention([rv({}), rv({}), rv({}), rv({ rating: 1 }), rv({ state: 0, rating: 1 })])).toEqual({ n: 4, pct: 75 });
    expect(trueRetention([]).pct).toBeNull();
  });

  it('dominio por tema', () => {
    const m = mastery([
      { topic_id: 'a', state: 0, due: '', stability: 0, lapses: 0 },
      { topic_id: 'a', state: 2, due: '', stability: 30, lapses: 0 },
      { topic_id: 'a', state: 2, due: '', stability: 5, lapses: 0 },
      { topic_id: 'a', state: 3, due: '', stability: 1, lapses: 2 },
      { topic_id: 'a', state: 2, due: '', stability: 50, lapses: 9, suspended: true },
    ]);
    expect(m.get('a')).toEqual({ nuevas: 1, aprendiendo: 2, dominadas: 1 });
  });

  it('puntos débiles: más fallos primero y solo con suficientes respuestas', () => {
    const many = (topic_id: string, n: number, again: number) => Array.from({ length: n }, (_, i) => rv({ topic_id, rating: i < again ? 1 : 3 }));
    const w = weakTopics([...many('ok', 20, 2), ...many('flojo', 10, 4), ...many('pocos', 3, 3)]);
    expect(w).toEqual([{ topicId: 'flojo', n: 10, failPct: 40 }, { topicId: 'ok', n: 20, failPct: 10 }]);
  });

  it('aviso de carga con tu tiempo por tarjeta', () => {
    const reviews = Array.from({ length: 20 }, () => rv({ duration_ms: 12000 }));
    expect(secondsPerCard(reviews)).toBe(12);
    expect(secondsPerCard([])).toBe(10);
    const w = loadWarning([200, 150, 160, 140, 150, 150, 100].map((n) => ({ n })), 12);
    expect(w).toEqual({ avgCards: 150, minutes: 30, peak: 200, heavy: true });
  });

  it('racha de días seguidos', () => {
    expect(streak([rv({ reviewed_at: at(0) }), rv({ reviewed_at: at(-1) }), rv({ reviewed_at: at(-2) }), rv({ reviewed_at: at(-4) })], today)).toBe(3);
    expect(streak([rv({ reviewed_at: at(-1) }), rv({ reviewed_at: at(-2) })], today)).toBe(2); // hoy aún no
    expect(streak([], today)).toBe(0);
  });
});
