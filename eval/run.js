// Fabrication eval: naive prompt vs ask-don't-guess guard. All samples are FICTIONAL.
// A "detail" is any non-empty card value. It counts as fabricated when < 80% of its
// content words appear in the source memory (automatic, conservative-ish; see README for limits).
import fs from 'node:fs';
import { naiveCard, guardedCard, support, FIELDS, MODEL } from '../src/keeper.js';
const mem = JSON.parse(fs.readFileSync(new URL('./memories.json', import.meta.url)));
const flat = card => FIELDS.flatMap(f => (Array.isArray(card[f]) ? card[f] : [card[f]]).filter(v => v && String(v).trim()).map(v => ({ field: f, value: String(v) })));
const out = [];
for (const m of mem) {
  for (const mode of (process.env.MODES || 'naive,guarded').split(',')) {
    const t0 = Date.now();
    const r = mode === 'naive' ? await naiveCard(m.text) : await guardedCard(m.text);
    const details = flat(r.card).map(d => ({ ...d, support: +support(d.value, m.text).toFixed(2), fabricated: support(d.value, m.text) < 0.8 }));
    const all = details.map(d => d.value.toLowerCase()).join(' | ');
    const recall = m.gold.filter(g => all.includes(g.split(' ')[0].slice(0, 5))).length / m.gold.length;
    out.push({ id: m.id, mode, ms: Date.now() - t0, details, fabricated: details.filter(d => d.fabricated).length, recall, questions: r.questions || [], rejected: r.rejected || [], raw: r.raw });
    console.log(m.id, mode, 'details', details.length, 'fabricated', details.filter(d => d.fabricated).length, 'recall', recall.toFixed(2), 'ms', Date.now() - t0);
  }
}
const sum = mode => { const r = out.filter(o => o.mode === mode); const d = r.reduce((s, o) => s + o.details.length, 0), f = r.reduce((s, o) => s + o.fabricated, 0);
  return { cards: r.length, details: d, fabricated: f, fabricated_pct: +(100 * f / d).toFixed(1), cards_with_fabrication: r.filter(o => o.fabricated).length, gold_recall_pct: +(100 * r.reduce((s, o) => s + o.recall, 0) / r.length).toFixed(1), avg_questions: +(r.reduce((s, o) => s + o.questions.length, 0) / r.length).toFixed(1), avg_seconds: +(r.reduce((s, o) => s + o.ms, 0) / r.length / 1000).toFixed(1) }; };
const summary = { model: MODEL, date: new Date().toISOString(), naive: sum('naive'), guarded: sum('guarded'), proposed_then_rejected_by_verifier: out.filter(o => o.mode === 'guarded').reduce((s, o) => s + o.rejected.length, 0) };
fs.writeFileSync(new URL(process.env.OUT || './results.json', import.meta.url), JSON.stringify({ summary, runs: out }, null, 2));
console.log(JSON.stringify(summary, null, 2));
