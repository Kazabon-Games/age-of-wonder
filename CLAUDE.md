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
  its own header). Each file is a standalone Node script, not a
  `playwright test` runner suite — serve the repo (`npx http-server`,
  port per the file's own `BASE_URL` default) then run the file directly
  (`node tests/wonderland-engine-adversarial.js`, per its own header
  comment). See the `playwright-adversarial-harness` skill for the shared
  scaffold both files (and every Shin-Maho-Arcade test file) follow.
  Neither suite injects state via `page.evaluate()` for anything the UI
  itself can do.
- **`.claude/agents/cartography.md`** — this repo's one local agent
  definition (also promoted into `Studio-Internal-`'s and
  `Shin-Maho-Arcade`'s canonical rosters as of 2026-08-03). No other
  `.claude/agents/` files exist here; other studio roles (`engineer`,
  `qa-playtest`, etc.) are assumed available from wherever the session
  picked them up, not locally overridden in this repo.
- **`.claude/skills/`** (added 2026-08-03, corrected 2026-08-08 — a
  live engineering-pass gap audit found this had drifted stale, the same
  copy-drift risk `STUDIO_BIBLE.md` §17 names for the shared agent-footer
  block, just in this file instead) — four skills exist on disk in this
  repo: `playwright-adversarial-harness` (studio-wide, also in
  `Shin-Maho-Arcade`), `overlay-focus-trap` and `safe-keyed-reimport`
  (both specific to this repo's own `trapFocus`/re-import patterns, not
  mirrored elsewhere), and `incident-postmortem` (studio-wide, added
  2026-08-04 — present here but never added to this list until now).
  Don't trust a hardcoded skill count in this file — `STUDIO_BIBLE.md`
  §12 in `Studio-Internal-` is the actual canonical index, and has
  already gone stale in its own agent-footer copies more than once.

## Known gaps, stated plainly (per studio convention — see `KAZABON_BIO.md`)

- No root-level `CHANGELOG.md` — version history lives in
  `wonderland/README.md`'s checkpoint entries and in individual HTML
  files' own in-file `<!-- CHANGELOG -->` comment blocks (`aow_gm_screen.html`,
  `aow_world_map.html`). There's no single place that aggregates all six
  documents' histories.
- A newly-authored or edited `.claude/agents/*.md` file in this repo is not
  reliably selectable as an agent type until a fresh session starts — see
  `STUDIO_BIBLE.md` §17 if you have access to it.
