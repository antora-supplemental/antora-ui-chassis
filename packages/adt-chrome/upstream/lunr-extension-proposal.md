# Proposal: `@antora/lunr-extension` + SoftNav / AdtChrome

**Target:** https://github.com/antora/lunr-extension (Antora org)

**Goal:** Document that search UI is *chrome-persistent* when the theme keeps `#search-input` outside swapped regions. No change to lunr index generation.

## Suggested doc addition (`docs/search-ui.adoc` or README)

- After soft navigation within a component, the input element may survive while page context changes.
- Themes that use SoftNav should either re-render the search partial on nav (unusual) or pair lunr with **AdtChrome** / a `soft-nav:loaded` refresh of scope metadata.
- Lunr keystroke behavior and dropdown mount parent (`#search-input.parentNode`) remain the contract.

## Optional code (non-breaking)

In `search-ui.js`, after init:

```javascript
function onNavigation (fn) {
  if (window.AdtChrome && typeof AdtChrome.on === 'function') {
    AdtChrome.on('loaded', fn)
  } else if (window.SoftNav && typeof SoftNav.on === 'function') {
    SoftNav.on('loaded', fn)
  } else {
    document.addEventListener('soft-nav:loaded', function (e) { fn(e.detail || {}) })
  }
}
onNavigation(function () {
  // Re-close dropdown, clear stale aria state if needed — no index rebuild
})
```

PR author: `@antora-supplemental` — link to `antora-ui-chassis/packages/adt-chrome/INTEGRATION.adoc`.
