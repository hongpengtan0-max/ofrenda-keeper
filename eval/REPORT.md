# Fabrication eval: does the ask-don't-guess guard actually work?

All 12 memories in `memories.json` are **fictional**, written for this test. Each one has a few certain details and, in some, an explicit hedge ("I think", "I can't remember").

Model: `gemma3:4b` (Q4_K_M GGUF, run in Ollama on CPU). Temperature 0.2. One run per memory per mode. This is a small test set, so treat the numbers as directional.

| | Unguarded prompt ("fill every field") | Ofrenda Keeper (guarded prompt + quote verifier) |
|---|---|---|
| Cards that parsed | 11 / 12 | 12 / 12 |
| Details on the cards | 277 | 61 |
| Generic decoration (candles, marigolds, "Unknown") | 110 | 0 |
| Claims about the person | 167 | 61 |
| **Invented claims** | **83** (49.7% of claims) | **0** |
| Embellished (true core + invented part) | 10 | 0 |
| Misattributed (right words, wrong person) | not counted | 2 (3.3%) |
| Cards with at least one invented claim | 11 / 11 parsed | 0 / 12 |
| Key details captured (keyword recall) | 87.5% | 91.7% |
| Follow-up questions per card | 0 | 4.5 |
| Avg seconds per card (CPU) | 26.1 | 12.6 |

How the labels were made:
- Unguarded: every one of the 277 details was hand-labeled as Grounded / Embellished / Invented / Decoration. The labels are in `naive_labels.json`, indexed into `results_v1.json`.
- Guarded: all 61 details and all 7 verifier rejections were hand-audited. The audit is in `guarded_labels.json`.
- The labeling was done by the AI coding assistant that built the project, reading each detail against the source text. The author reviewed every label and the result files against that rubric before publishing the numbers. The rubric is in the files; further spot-checks are welcome.
- The automatic check in `run.js` (does a detail's content words appear in the memory?) is **not** used for the headline numbers. It is part of the guard itself, so using it to score the guard would be circular.

What the guard got wrong:
- **2 misattributions passed the verifier.**
  - In m06 ("I always carried books"), the card said Mrs. Okafor "carried books".
  - In m08, Lucía carried "my mother" (her daughter), and the card said "her mother".
  - Word overlap cannot catch who did what. A person still has to read the card.
- **3 over-strict rejections.**
  - "teaching chess" was rejected because the memory said "taught".
  - "He liked jazz" was blocked because the same sentence says "I can't remember which records".
  - These become questions, not errors on the card.
- **4 correct rejections.**
  - "tamales" ×2: the person said "I think... maybe that was my mom".
  - "loved one" ×2: the model filled in a relationship nobody stated.

Iterations, kept for honesty:
- `results_v1.json` guarded v1 recall was only 37.5%. The model used field names the code dropped.
- `results_v2_guarded.json` reached 87.5% recall but had 9 over-strict rejections, caused by weak stemming.
- `results_v3_guarded.json` is the final run. The unguarded runs come from v1. The unguarded prompt never changed.

Reproduce: `npm run eval`. Use `MODES=guarded OUT=./results_x.json npm run eval` to run only the guarded mode.
