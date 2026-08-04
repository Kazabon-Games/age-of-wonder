---
name: incident-postmortem
description: Use after any real shipped defect gets fixed (a bug a playtest/security/qa pass caught, a repo-visibility mistake, anything that prompted creating a new role reactively) — or any time TEAM_STRUCTURE.md's own "name the gap the moment it's found" pattern is about to repeat itself for the third-plus time. A lightweight, blameless-postmortem-style template: a shared timeline, contributing conditions instead of blame, and owned action items. Read this before writing another one-off "here's what went wrong" paragraph — this closes the gap between finding an incident and actually processing it the same repeatable way twice.
---

# Incident Postmortem

**Why this exists as a skill, and why now (added 2026-08-03):**
`TEAM_STRUCTURE.md` already names its own pattern explicitly, more than
once: Security and DevOps both "exist because something already went
wrong once without them, not because they were planned ahead of time...
That's an honest pattern for this studio, not a one-off." Naming the
pattern is real, useful self-awareness — but naming it isn't the same as
having a repeatable *process* for responding to it. Every time this studio
has hit this shape, the response has been a paragraph of retrospective
prose in a bible/handover doc, written fresh each time, with no shared
structure to guarantee the same questions get asked twice. This skill is
the studio's first actual process response to its own repeated
observation, not another restatement of it.

**This is the reactive complement to `RECURRING_BUG_CATALOG.md`, not a
duplicate of it.** The catalog is the proactive half — a checklist to run
*before* shipping, built from bug classes that already recurred. This
skill is the structured response *after* something real already happened
— a real incident (not a caught-in-review near-miss) gets a shared
timeline and owned follow-up instead of just a prose paragraph, the same
way a caught-in-review bug class earns a catalog entry instead of just a
commit message.

## The industry practice this is grounded in

Blameless postmortems are Google SRE's own documented practice, run close
to the incident (Google's own convention: within 48 hours) — the
underlying principle: in a real system, a failure is almost never one
person making one mistake; it's accumulated conditions, process gaps, and
tooling limits that made the outcome possible, sometimes predictable. The
practice is also empirically, not just anecdotally, associated with
better outcomes — it's part of the profile DORA's own research correlates
with high-performing engineering teams (faster recovery, higher deploy
frequency). None of that requires a large team or an on-call rotation to
be worth doing — the studio-scale version below is the same shape, sized
down.

## When to run this

- After a real shipped defect is found and fixed — not a bug caught in
  code review before it ever shipped (that's the catalog's job), a
  **real** incident: something a player could have hit, or something that
  actually did ship publicly wrong (the repo-visibility incident that
  created `security-reviewer`/`devops-release` is the studio's own
  clearest example).
- Any time a new role or skill is about to get created *reactively* —
  before writing the new role/skill, run this first. The postmortem's own
  action items are what should generate the new role/skill's actual scope,
  not a fresh, unstructured "we clearly need X now" leap straight to the
  fix.
- Periodically, retroactively, against this studio's own real incident
  history — nothing requires the practice to only apply going forward; a
  postmortem written today about the repo-visibility incident is still
  real, useful work, even though the incident is already resolved and its
  reactive fix (Security + DevOps) already exists.

## The template

**1. Shared timeline.** What happened, in order, with real timestamps or
commit references where available — build this once, collaboratively, not
as several people's separate half-memories reconciled later. Include the
moment the problem was introduced (not just the moment it was noticed) if
it's findable.

**2. Contributing conditions, not a person or a single cause.** Ask
"because, why" repeatedly rather than stopping at the first plausible
answer. The studio's own real incident is a clean worked example: the
repo went public with two internal docs readable in git history —
*because* `git rm --cached` was believed to remove exposure, *because* no
one had verified that belief against git's actual history-retention
model, *because* no checklist existed that would have forced that
verification before the visibility flip, *because* no role owned
"security review before a publish-affecting change" as a standing
responsibility yet. Four real, stackable conditions — not "someone made a
mistake." Frame every contributing factor this way: a gap in process,
tooling, or interface, never an indictment of a person or a single
decision in isolation.

**3. Owned action items.** Each contributing condition from step 2 gets a
concrete follow-up with an actual owner (a named role, even if that role
is "producer" or "the next session that touches this area") — not a vague
"we should be more careful." The repo-visibility incident's real action
items, reconstructed against this template: create `security-reviewer`
(owns the checklist), create `devops-release` (owns Pages/repo mechanics),
write the checklist itself into `STUDIO_BIBLE.md` §10 and later the
`security-data-trust-checklist` skill. All three actually happened — this
is what "the postmortem generates the role's scope" looks like concretely,
even reconstructed after the fact.

**4. What would have caught this sooner.** A distinct, explicit question
from the action items above — not "what do we fix" but "what signal did
we have, or could we have had, that would have surfaced this before it
shipped." For the repo-visibility incident: a security-focused checklist
run before ANY visibility change, not created only after the first one
went wrong. This question is what keeps the process from being purely
reactive-to-the-same-thing-forever — it's aimed at the next, different
incident this studio hasn't had yet.

## What this is not

Not a blame assignment exercise, not a performance review, and not a
substitute for `RECURRING_BUG_CATALOG.md`'s proactive checklist role. A
postmortem that reads as "whose fault was this" has already failed at the
one thing that makes the practice work — psychological safety is what
lets contributing conditions actually surface honestly instead of getting
minimized or hidden. If a postmortem for this studio (a one-person-plus-
Claude-Code studio) ever reads like it's building a case against a
specific past decision-maker, that's a sign the framing has drifted from
"system gap" to "blame," and it should be rewritten before it's filed.

## Output

A short, four-section document (timeline / contributing conditions /
owned action items / what-would-have-caught-it-sooner) — doesn't need its
own file per incident for a studio this size; a section in the relevant
`<GAME>_HANDOVER.md` or a dated entry appended to this skill's own
"worked examples" (below, once a second real one exists) is enough. The
point is the shared structure being followed every time, not a heavyweight
artifact.
