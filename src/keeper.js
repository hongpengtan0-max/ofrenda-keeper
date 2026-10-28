// Ofrenda Keeper: turns spoken/typed memories of a loved one into an ofrenda card,
// without inventing anything. Mastra agent + memory + tools, Gemma 3 via Ollama, all local.
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { createOllama } from 'ollama-ai-provider-v2';
import { z } from 'zod';

const ollama = createOllama({ baseURL: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434') + '/api' });
export const MODEL = process.env.OFRENDA_MODEL || 'gemma3:4b';
const DB = process.env.OFRENDA_DB || 'file:' + new URL('../data/ofrenda.db', import.meta.url).pathname;

export const memory = new Memory({
  storage: new LibSQLStore({ id: 'ofrenda', url: DB }),
  options: { lastMessages: 40 },
});

export const keeper = new Agent({
  id: 'ofrenda-keeper', name: 'Ofrenda Keeper',
  instructions: `You help a person remember someone they lost, for a Día de los Muertos ofrenda.
Reply in 1-2 short, warm sentences: thank them for what they shared, then ask one gentle question. Do not describe, imagine, or add anything they did not say.`,
  model: ollama.chat(MODEL),
  memory,
});

// A model-free extractor agent (no memory) so every card is rebuilt from the user's own words only.
const extractor = new Agent({
  id: 'ofrenda-extractor', name: 'Extractor',
  instructions: 'You extract information into JSON. Output only JSON.',
  model: ollama.chat(MODEL),
});

export const FIELDS = ['name', 'relationship', 'years', 'favorite_foods', 'songs', 'sayings', 'stories', 'altar_items'];

// ---------- text helpers ----------
const STOP = new Set('a an the and or of to in on at for with his her their my our your was were is are be been he she they it that this as by from had has have would used loved love liked like very so but not all always every one two'.split(' '));
const norm = s => String(s).toLowerCase().replace(/[“”"’'`]/g, "'").replace(/[^a-z0-9áéíóúñü' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const SYN = { grandfather: 'grandpa', grandmother: 'grandma', abuela: 'grandma', abuelo: 'grandpa', tío: 'uncle', tía: 'aunt', 'great': 'great' };
const stem = w => (SYN[w] || w).replace(/'s$/, '').replace(/(ies)$/, 'y').replace(/(ly|ing|ed|es|s)$/, '').replace(/([b-df-hj-np-tv-z])\1$/, '$1');
export const words = s => norm(s).split(' ').map(w => w.replace(/^'+|'+$/g, '')).filter(w => w && !STOP.has(w)).map(stem);
export function support(value, source) {
  const v = words(value); if (!v.length) return 1;
  const src = new Set(words(source));
  return v.filter(w => src.has(w)).length / v.length;
}

// ---------- Mastra tools (invoked by workflow steps) ----------
export const verifyQuoteTool = createTool({
  id: 'verify-quote',
  description: 'Checks that a detail is backed by a verbatim quote from the user\'s own memories.',
  inputSchema: z.object({ value: z.string(), quote: z.string(), source: z.string() }),
  outputSchema: z.object({ ok: z.boolean(), reason: z.string() }),
  execute: async ({ value, quote, source }) => {
    // No quote, but a short value that appears word for word in the memories counts as its own quote.
    if ((!quote || norm(quote).length < 3) && words(value).length && words(value).length <= 4 && support(value, source) === 1) quote = value;
    const q = norm(quote), s = norm(source);
    if (!q || q.length < 3 || !words(quote).length) return { ok: false, reason: 'no quote' };
    const quoteInSource = s.includes(q) || support(quote, source) >= 0.9;
    if (!quoteInSource) return { ok: false, reason: 'quote not found in memories' };
    if (support(value, quote + ' ' + source) < 0.8) return { ok: false, reason: 'value goes beyond the quote' };
    // A detail the person hedged on ("I think", "maybe") is not a fact yet: ask instead.
    const sentence = source.split(/(?<=[.!?])\s+/).find(x => support(quote, x) >= 0.9) || quote;
    if (/\b(i think|maybe|not sure|i don'?t remember|can'?t remember|i forget|might have|probably)\b/i.test(sentence)) return { ok: false, reason: 'the person was unsure' };
    return { ok: true, reason: 'quoted' };
  },
});

export const askTool = createTool({
  id: 'ask-follow-up',
  description: 'Turns an unsupported or missing detail into a gentle follow-up question.',
  inputSchema: z.object({ field: z.string(), value: z.string().optional(), name: z.string().optional() }),
  outputSchema: z.object({ question: z.string() }),
  execute: async ({ field, value, name }) => {
    const who = name || 'them';
    const Q = {
      name: 'What name should go on the card?',
      relationship: `How were you related to ${who}?`,
      years: `Do you remember the years ${who} was born and passed? It is fine to leave this blank.`,
      favorite_foods: `What food would you put on the altar for ${who}?`,
      songs: `Was there a song ${who} loved or sang?`,
      sayings: `Was there something ${who} always used to say?`,
      stories: `Is there a moment with ${who} you want the card to remember?`,
      altar_items: `Is there an object that reminds you of ${who}?`,
    };
    return { question: value ? `I wasn't sure about "${value}" (${field.replace('_', ' ')}). Did I get that right, or can you tell me in your words?` : Q[field] };
  },
});

// Small models invent their own field names ("activities", "drinks"); map them back.
export function fieldOf(x) {
  const k = String(x).toLowerCase();
  if (FIELDS.includes(k)) return k;
  if (/food|drink|dish|meal|cook|ate|eat/.test(k)) return 'favorite_foods';
  if (/song|music|sang|sing/.test(k)) return 'songs';
  if (/say|said|quote|phrase|nickname/.test(k)) return 'sayings';
  if (/object|item|thing|kept|owned|wore|cloth/.test(k)) return 'altar_items';
  if (/relat|role/.test(k)) return 'relationship';
  return 'stories';
}

function parseJSON(t) {
  const m = String(t).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')); } catch { return null; } }
}

// ---------- the two prompts we compare ----------
export const NAIVE_PROMPT = src => `Here are someone's memories of a loved one:
"""${src}"""
Create a complete, beautiful ofrenda (Día de los Muertos altar) card for this person as JSON with keys:
name, relationship, years, favorite_foods (array), songs (array), sayings (array), stories (array of short sentences), altar_items (array).
Fill every field.`;

export const GUARDED_PROMPT = src => `Here are someone's memories of a loved one:
"""${src}"""
List EVERY concrete detail the person actually said: what the loved one did, made, ate, drank, sang, said, kept, wore, or was known for.
Do not guess, infer, embellish, or add typical Día de los Muertos items unless they were mentioned. If the person sounds unsure ("I think", "maybe", "I don't remember"), put it in "unsure", not in facts.
Fields: relationship (e.g. grandpa, friend), favorite_foods (foods and drinks), songs, sayings (things they said, in quotes), stories (things they did or were known for), altar_items (objects they owned or used).
Return JSON: {"name": "...", "facts": [{"field": "...", "value": "short detail", "quote": "exact words copied from the memories"}], "unsure": ["..."]}
Every fact MUST have a quote copied word for word from the memories.`;

export async function naiveCard(source) {
  const r = await extractor.generate(NAIVE_PROMPT(source));
  const j = parseJSON(r.text) || {};
  const card = {}; for (const f of FIELDS) card[f] = j[f] ?? (f.endsWith('s') && f !== 'years' ? [] : '');
  return { card, raw: r.text };
}

// Guarded pipeline as a Mastra workflow: extract -> verify each fact with a tool -> ask about the rest.
const extractStep = createStep({
  id: 'extract', inputSchema: z.object({ source: z.string() }),
  outputSchema: z.object({ source: z.string(), raw: z.string(), name: z.string(), facts: z.array(z.any()), unsure: z.array(z.any()) }),
  execute: async ({ inputData }) => {
    const r = await extractor.generate(GUARDED_PROMPT(inputData.source));
    const j = parseJSON(r.text) || {};
    return { source: inputData.source, raw: r.text, name: String(j.name || ''), facts: Array.isArray(j.facts) ? j.facts : [], unsure: Array.isArray(j.unsure) ? j.unsure : [] };
  },
});
const verifyStep = createStep({
  id: 'verify', inputSchema: extractStep.outputSchema,
  outputSchema: z.object({ card: z.any(), questions: z.array(z.string()), rejected: z.array(z.any()), raw: z.string() }),
  execute: async ({ inputData: d }) => {
    const card = Object.fromEntries(FIELDS.map(f => [f, f === 'name' || f === 'relationship' || f === 'years' ? '' : []]));
    const questions = [], rejected = [];
    const nameOk = d.name && support(d.name, d.source) >= 0.99;
    card.name = nameOk ? d.name : '';
    for (const f of d.facts) {
      if (f && f.field) f.field = fieldOf(f.field);
      if (!f || !FIELDS.includes(f.field) || f.field === 'name' || !f.value) continue;
      const v = await verifyQuoteTool.execute({ value: String(f.value), quote: String(f.quote || ''), source: d.source }, {});
      if (v.ok && f.field === 'years' && !/\b(1[89]|20)\d\d\b/.test(String(f.value))) { rejected.push({ ...f, reason: 'not a birth/death year' }); continue; }
      if (v.ok) { Array.isArray(card[f.field]) ? card[f.field].push(String(f.value)) : (card[f.field] = card[f.field] || String(f.value)); card._evidence ??= {}; card._evidence[f.value] = f.quote; }
      else { rejected.push({ ...f, reason: v.reason }); questions.push((await askTool.execute({ field: f.field, value: String(f.value), name: card.name }, {})).question); }
    }
    for (const u of d.unsure.slice(0, 2)) if (u) questions.push(`You weren't sure about this: "${String(u).replace(/\.$/, '')}". Do you want to add it, or leave it out?`);
    for (const f of FIELDS) if (!card[f] || (Array.isArray(card[f]) && !card[f].length)) questions.push((await askTool.execute({ field: f, name: card.name }, {})).question);
    return { card, questions: [...new Set(questions)].slice(0, 5), rejected, raw: d.raw };
  },
});
export const cardWorkflow = createWorkflow({ id: 'ofrenda-card', inputSchema: z.object({ source: z.string() }), outputSchema: verifyStep.outputSchema })
  .then(extractStep).then(verifyStep).commit();

export async function guardedCard(source) {
  const run = await cardWorkflow.createRun();
  const res = await run.start({ inputData: { source } });
  if (res.status !== 'success') throw new Error('workflow failed: ' + res.status);
  return res.result;
}

// ---------- conversation with memory ----------
export async function remember(threadId, text) {
  const r = await keeper.generate(text, { memory: { thread: threadId, resource: 'local-user' } });
  return r.text;
}
export async function sourceFor(threadId) {
  const { messages } = await memory.recall({ threadId, perPage: false });
  return messages.filter(m => m.role === 'user').map(m => m.content?.content || m.content?.parts?.map(p => p.text).join(' ') || '').join('\n');
}
