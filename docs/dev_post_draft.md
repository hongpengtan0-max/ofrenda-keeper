---
title: "An AI invented half the memories on an ofrenda card. Ofrenda Keeper writes down only what you said, and asks about the rest"
published: true
tags: devchallenge, hf26challenge, gemma, mastra
cover_image: https://raw.githubusercontent.com/hongpengtan0-max/ofrenda-keeper/main/docs/screenshots/02_card_after_answer.png
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26)*

**Prize categories:** Best Use of Gemma, Best Use of Mastra

## What I Built

I asked Gemma 3 to make a Día de los Muertos ofrenda card for "Grandpa Hiro", a made-up grandfather from my test set. All I told it was that he taught me chess on a board with a missing knight replaced by a bottle cap, and that he liked jazz, *"but I can't remember which records."*

The card came back with:

- a surname I never gave him (**Tanaka**)
- favorite foods: **mochi, sushi, tempura, green tea ice cream**
- favorite artists: **Miles Davis and Ella Fitzgerald**
- three wise sayings he never said
- "the scent of his pipe tobacco"

That last one is the ghost in the machine: a voice that sounds like memory but belongs to nobody.

On an ofrenda, a made-up detail is worse than a blank line. So I built **Ofrenda Keeper**, a local app that turns what you tell it about someone you miss into an altar card. Its one rule: **if you didn't say it, it doesn't go on the card. If you weren't sure, it asks you instead of guessing.**

- Every detail on the card carries the exact words it came from (hover to see them).
- When you hedge ("I think the green tamales, but maybe that was my mom"), the detail is held back and becomes a question.
- Missing pieces (a song, a saying, the years) become gentle follow-ups, not filler.
- A button shows what the *same model* would have written without the guard, so you can see the difference.

> All the memories in this post, the demo and the test set are **fictional samples** I wrote for testing. I didn't want to put a real person's story into a project I was still debugging.

## Demo

{% youtube rnJqAOy4B-k %}

▶️ Video (about 2 min, recorded on a CPU-only box, real model latency): [docs/demo.mp4](https://github.com/hongpengtan0-max/ofrenda-keeper/blob/main/docs/demo.mp4)

![Card after two fictional memories](https://raw.githubusercontent.com/hongpengtan0-max/ofrenda-keeper/main/docs/screenshots/02_card_after_answer.png)

In the demo I type a fictional memory: *"My grandmother Lucía made pan de muerto with orange zest… She liked boleros, I think, but I'm not sure which ones."*

- Pan de muerto and orange zest go on the card.
- **Boleros do not.** They show up under "I'd like to ask you" instead.
- When I add *"She always said 'Ya llegará.' She kept her rosary in a cookie tin"*, the saying and the rosary appear, each with its quote.

![Unguarded comparison](https://raw.githubusercontent.com/hongpengtan0-max/ofrenda-keeper/main/docs/screenshots/03_unguarded_comparison.png)

The "What would an unguarded AI write?" button asks the same Gemma model with a plain "fill every field" prompt. It immediately adds "a picture of Lucía wearing a bolero", "orange blossoms representing her love of orange zest", and more.

## Code

{% github hongpengtan0-max/ofrenda-keeper %}

## How I Built It

**Stack, all open and all local:**

- **Gemma 3 4B** (Q4_K_M GGUF) running in **Ollama** on CPU, about 9 tokens/s on the 8-core box I built it on.
- **Mastra**: an `Agent` with `Memory` (LibSQL file), two `createTool` tools, and a two-step `createWorkflow`.
- Express plus one HTML file for the altar card.

**The pipeline, run every time you share a memory:**

1. **Remember.** The Mastra agent replies in a sentence or two and asks one question. Mastra `Memory` stores the thread, so the card is always rebuilt from *everything you've said*, not from the model's last reply.
2. **Extract** (workflow step 1). Gemma gets only your own messages and must return each detail with a **verbatim quote**.
3. **Verify** (workflow step 2). The `verify-quote` tool checks, in plain code:
   - the quote really exists in your words;
   - the detail doesn't go beyond the quote;
   - the sentence wasn't hedged ("I think", "maybe", "I can't remember").

   Anything that fails goes to the `ask-follow-up` tool and becomes a question.

One honest design note: Gemma 3 through Ollama doesn't do reliable native tool calling. So the Mastra tools are executed by the workflow steps, not picked by the model. I ended up liking that. The guard is code the model can't talk its way around, not a polite request in a prompt.

### Does the guard actually work? I measured it.

I wrote 12 short **fictional** memories with a few certain details each, and hedges in some ("I don't remember what music she liked"). Each one went through both the plain prompt and Ofrenda Keeper, once each, on the same model. Then an AI coding assistant labeled every detail against the source text, using a fixed rubric in the repo: grounded, embellished, invented, or generic decoration. I reviewed every label and the underlying result files before publishing the numbers.

| | Unguarded prompt | Ofrenda Keeper |
|---|---|---|
| Claims about the person | 167 | 61 |
| **Invented claims** | **83 (49.7%)** | **0** |
| Cards with ≥1 invented claim | 11 of 11 that parsed | 0 of 12 |
| Misattributed (right words, wrong person) | – | 2 (3.3%) |
| Key details captured | 87.5% | 91.7% |
| Follow-up questions per card | 0 | 4.5 |
| Seconds per card on CPU | 26.1 | 12.6 |

The unguarded cards also had 110 generic decorations (candles, marigolds, "Unknown"). I didn't count those as lies.

**Where it still fails:**

- **Two misattributions got through.** In one memory, "I always carried books" became the *neighbor* carrying books. In another, Lucía carrying "my mother" became "her mother". Word overlap can't tell who did what, so the card still needs a human read-through. I say so in the UI.
- **It is sometimes too strict.** "He liked jazz, but I can't remember which records" got the jazz held back entirely, because the sentence contains a hedge. That costs you one extra question, not a false memory, which is the trade-off I want here.
- **The first version was useless.** It captured only 37.5% of key details, because Gemma invented its own field names ("activities") and my code silently dropped them. Mapping field names fixed that. Better stemming then cut over-strict rejections from 9 to 3. All three result files are in the repo.

Twelve memories is a small test. The assistant applied the rubric to every detail; I reviewed those labels and am responsible for the numbers. The rubric, the raw outputs, and every label are in [`eval/`](https://github.com/hongpengtan0-max/ofrenda-keeper/tree/main/eval) for anyone who wants to check the work.

## Why Does Open Innovation Matter?

- **The stories stay home.** Memories of someone who died are the most private data I can think of. Here they go into a SQLite file on your own disk and a model running on your own CPU. Nothing is uploaded, and nothing becomes training data for someone else.
- **It works with the lights off.** Once the GGUF is downloaded, the whole thing runs offline. That suits sitting with a grandparent who has no Wi-Fi, or an altar that should outlast any startup's free tier.
- **I could put the guard in the right place.** Because the model and the orchestration are open, the fabrication check lives in my code, between the model and the card. With a closed chat product, I could only ask nicely in a prompt, and the unguarded column above shows how that goes.
- **It costs nothing to run.** That matters for something you might open once a year, every November.
- **It's swappable.** Change `OFRENDA_MODEL` to a bigger Gemma when you have the RAM. The eval tells you whether it got better or just more confident.

## AI assistance disclosure

I built this with an AI coding assistant. It wrote most of the code, the eval scripts, the demo recording script, and the first draft of this post. It also applied the eval rubric in the repo to label every unguarded and guarded detail against the source text (277 unguarded details; 61 guarded details plus verifier rejections). I directed the project, reviewed every label and the result files against that rubric, and am responsible for what is published here. All test memories are fictional, and no real person's story was used.
