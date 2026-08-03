---
name: overlay-focus-trap
description: Use when adding or debugging any modal, drawer, or overlay in an Age of Wonder document (aow_srd.html, aow_heir_record.html, aow_play_sheet.html, aow_gm_screen.html, aow_world_map.html, aow_spell_creator.html) — keyboard Tab/Escape trapping, nested-overlay stacking, or focus-return-on-close. This exact bug class has already shipped and been fixed independently in this repo more than once; read this before hand-rolling a new trap or copy-pasting an old one without understanding it.
---

# Overlay Focus Trap

**Why this is a skill and not just "copy the function":** all six documents
in `age-of-wonder` (`aow_srd.html:2941`, `aow_heir_record.html:2382`,
`aow_play_sheet.html:2342`, `aow_gm_screen.html:1614`,
`aow_world_map.html:509`, `aow_spell_creator.html:744`) independently
declare their own near-verbatim `trapFocus`/`untrapFocus` pair — same
internal variable names (`_aowOverlayStack`, `_aowFocusReturnEl`,
`_aowKeyHandler`), same stack-based nesting logic — because this repo's
single-file-no-build convention means nothing is actually shared at the
code level (see `cartography.md` for why that duplication is deliberate
here, not an oversight). That duplication already had a real cost: a
focus-trap-stacking fix was applied once across five documents at once
(recognized as latent shared code), then had to be **reapplied a second
time** in a sixth document because it redeclares the helpers locally
rather than importing them, then a third, related variant surfaced
separately (a drawer whose content had zero focusable elements, so focus
never entered the trapped subtree at all). All three are documented in
`RECURRING_BUG_CATALOG.md` §1. This skill exists so the next overlay is
added *with* that history, not by copy-pasting a six-year-old function
body and hoping it's still the fixed version.

## The reference implementation

`aow_spell_creator.html:744-771` (`trapFocus`/`untrapFocus`) is a clean,
representative copy — read it directly before copying from a different
file, since the whole point is that these six copies can drift out of
sync with each other silently. The shape:

```js
function trapFocus(overlayEl){
  if (overlayEl._aowKeyHandler) untrapFocus(overlayEl); // re-entrant guard
  if (_aowOverlayStack.length === 0) _aowFocusReturnEl = document.activeElement; // remember where to return focus
  _aowOverlayStack.push(overlayEl);
  const focusables = overlayEl.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
  if (focusables.length) focusables[0].focus();
  overlayEl._aowKeyHandler = function(e){
    if (e.key==='Escape'){ e.stopPropagation(); overlayEl._aowOnEscape && overlayEl._aowOnEscape(); return; }
    if (e.key!=='Tab' || !focusables.length) return;
    const first=focusables[0], last=focusables[focusables.length-1];
    if (e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  };
  overlayEl.addEventListener('keydown', overlayEl._aowKeyHandler);
}
function untrapFocus(overlayEl){
  if (overlayEl._aowKeyHandler) overlayEl.removeEventListener('keydown', overlayEl._aowKeyHandler);
  const idx = _aowOverlayStack.indexOf(overlayEl);
  if (idx!==-1) _aowOverlayStack.splice(idx,1);
  if (_aowOverlayStack.length > 0) {
    const parent = _aowOverlayStack[_aowOverlayStack.length-1];
    const parentFocusables = parent.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (parentFocusables.length) parentFocusables[0].focus(); // hand focus back to the overlay underneath
  } else if (_aowFocusReturnEl && _aowFocusReturnEl.focus) {
    _aowFocusReturnEl.focus(); // or all the way back to whatever opened the first overlay
  }
  if (_aowOverlayStack.length === 0) _aowFocusReturnEl = null;
}
```

Call `trapFocus(overlayEl)` when an overlay opens, `untrapFocus(overlayEl)`
when it closes — `aow_spell_creator.html`'s `bugrepOpen()`/`bugrepClose()`
(lines 787-798) is the minimal worked example: set `._aowOnEscape` on the
element, show it, `trapFocus()`; on close, `untrapFocus()` then hide it.

## Three specific failure modes already found in this repo — check for all three when adding a new overlay

1. **Stacking two overlays without using the shared `_aowOverlayStack`.**
   If a second overlay can open while a first is still open (a confirm
   dialog launched from within a drawer), both must go through the *same*
   `trapFocus`/`untrapFocus` pair in that file so the stack (and the
   focus-return chain on close) actually nests correctly. A one-off modal
   that rolls its own Escape handler outside this stack will fight the
   outer overlay's handler.
2. **A file that redeclares `trapFocus`/`untrapFocus` locally, fixed
   independently.** Because every file has its own copy, a bug fixed in
   one file's copy is not fixed in any other file's copy — when you find
   or fix a bug in this pattern, grep all six files for their own
   `trapFocus` declaration and check whether the same bug exists there
   too, don't assume "this is shared code, fixing it once is enough."
3. **Overlay content with zero focusable elements.** `focusables[0].focus()`
   silently does nothing if `focusables.length === 0` — the trap installs
   correctly (Escape still works) but Tab-trapping never really engaged
   because there was nothing to trap focus among. If an overlay can ever
   render with no interactive children (a loading state, a pure-message
   dialog), make sure it has at least one focusable element (even a close
   button) or explicitly document that this overlay is Escape-only.

## Verification

Test Tab-cycling forward and backward (Shift+Tab) at both ends of an
overlay's focusable set, Escape closing the *innermost* overlay only when
two are stacked, and focus landing back on the exact element that had it
before the overlay opened (not just "some" element) after the last overlay
in a stack closes. Do this via real keyboard events in a live browser
(Playwright `page.keyboard.press('Tab')`/`page.keyboard.press('Escape')`),
not by reading the trap function and confirming it looks structurally
correct — see `playwright-adversarial-harness` for the harness pattern.
