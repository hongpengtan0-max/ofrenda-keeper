import express from 'express';
import { remember, sourceFor, guardedCard, naiveCard, MODEL } from './keeper.js';
const app = express();
app.use(express.json());
app.use(express.static(new URL('../public', import.meta.url).pathname));
app.post('/api/remember', async (req, res) => {
  try {
    const { thread = 'default', text } = req.body;
    const reply = await remember(thread, text);
    const source = await sourceFor(thread);
    const result = await guardedCard(source);
    res.json({ reply, ...result });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
// Side-by-side "what an unguarded prompt would have put on the altar"
app.get('/api/naive', async (req, res) => {
  try { res.json(await naiveCard(await sourceFor(req.query.thread || 'default'))); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.get('/api/info', (_q, r) => r.json({ model: MODEL }));
const port = process.env.PORT || 4400;
app.listen(port, () => console.log(`Ofrenda Keeper on http://localhost:${port} (model ${MODEL})`));
