---
name: engineering-architecture-decisions
description: Use when deciding whether to add architectural complexity — a build step, object pooling, a test framework, a new abstraction, a recovery/retry mechanism — or when designing how a system should fail and recover. Covers real, named computer-science theory (crash-only software's "the only way to bring it up is by initiating recovery," the Rule of Three, YAGNI vs. known constraints) grounded in this studio's own already-correct-but-previously-unformalized engineering calls — the engineering-craft counterpart to music-theory-mood-mapping and visual-theory-shape-motion-mapping. Read this before adding an abstraction, a recovery mechanism, or an optimization from scratch.
---

# Engineering Theory: Recovery, Abstraction Timing, and Known-vs-Speculative Complexity

`engineer.md` already states this role's working discipline (profile
before optimizing, weigh invasiveness against evidence, watch the
three-trigger pattern). This skill is the layer underneath that: the
real, named theory explaining *why* those calls were the right ones —
the same relationship `music-theory-mood-mapping` has to
`adaptive-game-audio`'s signal-chain technique, and
`visual-theory-shape-motion-mapping` has to `faceted-gem-rendering`.

## Crash-only recovery: real theory, already correctly applied once

Real, named theory (Candea & Fox, "Crash-Only Software," HotOS 2003):
components that are only ever stopped by crashing and only ever started
by a full recovery — never a careful, incremental "patch just the broken
part" repair — are counter-intuitively **more** reliable than components
with a separate, complex graceful-shutdown/partial-recovery path,
because the recovery path is exercised every time (crashes are common,
graceful-shutdown code often isn't), and because a partial repair can
leave hidden, still-corrupted state behind that a full reset can't.

This studio already built exactly this, correctly, without naming it:
Iridescent Cosmology's game-loop crash safety net
(`iridescentcosmology.html`'s `loop()`/`handleCrash`/`recoverFromCrash`,
closing a real incident named in the file's own v2.11.0 changelog — an
uncaught exception mid-`update()` killed the sim/render loop permanently,
"recoverable only by force-quitting to the menu"). The first
`recoverFromCrash()` draft only reset `camX`/`camY` — a careful,
targeted, incremental repair — and the exact same crash recurred on the
very next frame, live, confirmed by test. The fix wasn't a more careful
targeted repair; it was resetting *all* run state (`player`, `enemies`,
`particles`, `gems`, `camX`/`camY`, `boss`/`boss2`, everything) to the
same clean-slate values a brand new run already starts from — crash-only
recovery's actual claim, proven true the hard way in this exact file.

**The check, going forward**: when building any recovery path (a crash
handler, a corrupted-save fallback, a failed-import recovery), default
to resetting to a known-good clean state rather than attempting a
targeted repair of just the field that's known to be broken — the
targeted repair only ever covers the specific failure you already found,
not the ones you didn't. `json-import-validation`'s real analog
(`safe-keyed-reimport`, age-of-wonder) already does this correctly too:
a bad row is dropped and reported loudly, not partially patched in place.

## The Rule of Three: this studio's own skill-writing bar, now named

Real, named theory (Don Roberts, popularized by Martin Fowler,
*Refactoring*): two instances of similar code don't justify an
abstraction — abstracting on the second occurrence risks committing to
the *wrong* shape before a third data point confirms what's actually
invariant across cases. The third occurrence is the real signal.

This studio's own stated bar for writing a new skill — *"a pattern
that's already cost something twice, not a preemptive write the first
time something looks reusable"* (`STUDIO_BIBLE.md` §12) — is the Rule of
Three in different words, arrived at independently through this studio's
own incident history (the faceted-gem "generic shape" mistake shipping
on both game repos before the skill existed to stop a third occurrence;
`overlay-focus-trap` written only after the same focus bug was
independently re-fixed in 5 files). Naming it explicitly closes the loop:
this isn't just "the studio's own convention," it's applying a
well-established, real principle correctly, and the same bar should
extend to code abstractions generally, not just skill-writing — two
similar call sites is still a coincidence; the third is a pattern.

## YAGNI vs. known constraints: this studio's pooling precedent, correctly applied

Real, named theory (YAGNI, Extreme Programming): implement only what's
needed *now* — but YAGNI does not mean "never architect for scale," it
means don't architect for *speculative* scale. The real distinction is
known constraints (a measured, real load; a contractual/legal
requirement) versus speculative ones ("what if we needed this someday").

`engineer.md`'s own defining precedent (object pooling for a dense-entity
browser game) is a textbook-correct application of exactly this
distinction, arrived at independently: pooling *felt* like an obviously
necessary optimization for "hundreds of enemies/particles/bullets on
screen" — the speculative case YAGNI warns against building for on
instinct. Instead of building it on that instinct, the studio profiled
first (heap usage during a real 290-enemy dense wave, 6 seconds of
sustained churn): stable 3.4–5.5MB, no GC sawtooth. The real constraint
didn't exist yet, so pooling wasn't built — correctly declining
complexity that *looked* justified but wasn't, per real measurement, not
per YAGNI's slogan alone.

**The check, going forward**: before adding an optimization, an
abstraction, or a recovery mechanism because it "feels" like it will be
needed, ask which category the justification actually falls into —
a real, already-measured constraint, or a speculative one — and if it's
speculative, measure before building, the same way the pooling
precedent already did.

## When complexity IS the known constraint, not speculation

`engineer.md`'s own three-trigger pattern (changelog-as-version-control
standing in for real git history, no persistent test suite, a single
file outgrown comfortable single-artifact editing) is this studio's own
concrete answer to "how do I know a known constraint has actually
arrived, not just started to feel close." Two of the three triggers
present is the stated threshold for saying so explicitly — a real,
falsifiable check, not a vibe, and the direct engineering-side analog to
Phase 1's own taxonomy work re-measuring the module-count ceiling this
session (13→15 Iridescent Cosmology, 11→12 Wardfall, 9→10 Sigil Chain) —
naming a ceiling once doesn't stop it moving; it has to be watched, not
just recorded.

## Shared studio context (every agent carries this)

You work inside Kazabon Game Studio, publishing to Shin Mahou Arcade. Full
detail lives in `STUDIO_BIBLE.md` and `KAZABON_BIO.md` in this repo.

- **Measure, don't assume.** The crash-recovery fix's own first draft
  (camX/camY only) is the concrete proof this skill is built on: it
  looked complete, was tested, and still recrashed live — confirmed by
  running it, not by reading the code and calling it correct.
- **No padding.** This skill documents real, already-applied theory —
  not a generic software-engineering-principles primer added because "a
  real engineering team would cite one."
- **This skill is studio-wide** — the crash-only recovery pattern applies
  to any stateful in-browser tool in either game repo; the Rule of
  Three/YAGNI sections apply to `age-of-wonder` and `Shin-Maho-Arcade`
  equally, and to skill-writing itself.
