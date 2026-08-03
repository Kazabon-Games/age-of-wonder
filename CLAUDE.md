# age-of-wonder

Kazabon Games' TTRPG toolkit repo. This file didn't exist before
2026-08-03 — before this, onboarding a new session meant reconstructing
context from `git log` and in-file changelog comments alone. Read this
first; it's short on purpose.

## Start here

- **Studio-wide context lives in a separate, private repo** —
  `Studio-Internal-`. If you have access to it, read `STUDIO_BIBLE.md`
  §1–2, `TEAM_STRUCTURE.md`, and `KAZABON_BIO.md` before doing substantive
  work here — this repo's own `.claude/agents/cartography.md` assumes that
  context and doesn't repeat it. If you don't have access, `cartography.md`
  carries a compressed summary at its own end.
- This repo has no `<GAME>_HANDOVER.md` of its own in `Studio-Internal-` —
  its equivalent is `wonderland/README.md`, a long-form engineering journal
  (checkpoint-by-checkpoint, not prose-summarized) covering the Wonderland
  engine's build history, known gaps, and process lessons. Read it before
  assuming a feature doesn't exist or a bug is new.

## What's in this repo

- **Four (now five) single-file HTML reference tools at root**:
  `aow_srd.html` (rules reference), `aow_heir_record.html` (character
  sheet), `aow_play_sheet.html`, `aow_gm_screen.html`, `aow_world_map.html`,
  `aow_spell_creator.html` — no build step, no shared imports between them
  by design (see `cartography.md` for why a shared component still gets
  duplicated per-file here rather than factored out).
- **`wonderland/`** — the actual "Wonderland" diceless RPG resolution
  engine: `engine.js` (rules), `schema.js`, `houses.js`, `persistence.js`,
  `importHeirRecord.js`, `tutorial.js`, `worldNpcs.js`,
  `worldStateBridge.js`, plus `harness.html`/`play.html` as the two ways to
  actually run it. `wonderland/README.md` is the authoritative history —
  read it, don't infer architecture from file names alone.
- **`tests/`** — two Playwright suites, no other test framework:
  `wonderland-engine-adversarial.js` (224+ hand-derived rules checks
  against `harness.html`, verified against the SRD's own worked examples)
  and `wonderland-play-tutorial.js` (UI-driven, desktop + mobile-viewport,
  drives `play.html` through real clicks — "the harness is the user," per
  its own header). Run with `npx playwright test tests/` (or however the
  individual file's own header specifies) against a locally served copy —
  neither suite injects state via `page.evaluate()` for anything the UI
  itself can do.
- **`.claude/agents/cartography.md`** — this repo's one local agent
  definition (also promoted into `Studio-Internal-`'s and
  `Shin-Maho-Arcade`'s canonical rosters as of 2026-08-03). No other
  `.claude/agents/` files exist here; other studio roles (`engineer`,
  `qa-playtest`, etc.) are assumed available from wherever the session
  picked them up, not locally overridden in this repo.

## Known gaps, stated plainly (per studio convention — see `KAZABON_BIO.md`)

- No root-level `CHANGELOG.md` — version history lives in
  `wonderland/README.md`'s checkpoint entries and in individual HTML
  files' own in-file `<!-- CHANGELOG -->` comment blocks (`aow_gm_screen.html`,
  `aow_world_map.html`). There's no single place that aggregates all six
  documents' histories.
- A newly-authored or edited `.claude/agents/*.md` file in this repo is not
  reliably selectable as an agent type until a fresh session starts — see
  `STUDIO_BIBLE.md` §17 if you have access to it.
