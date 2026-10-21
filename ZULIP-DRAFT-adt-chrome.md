Subject: AdtChrome — shared navigation context for SoftNav + supplemental UI

Hi all —

We've been shipping same-origin soft navigation (region swaps on mast / nav / article) in supplemental UI. It works well for *content* features (Mermaid, lightbox, math): re-run on `soft-nav:loaded`.

*Persistent chrome* is harder: the search omnibox, dock, and similar controls stay in the DOM while page context changes. Each extension was re-implementing "parse the fetched HTML again," which breaks easily (blank scope menus, stale labels).

We're proposing a small **chassis layer** — **AdtChrome** — that sits after SoftNav:

* Each page ships a tiny `#adt-page-context` block (component, version, URL).
* After every navigation, AdtChrome updates `AdtChrome.context` and emits `context` / `loaded` phases (plus DOM events `adt-chrome:*`).
* Extensions use a compat helper: prefer AdtChrome when present, else SoftNav, else full page load.

Docs + integration guide for extension authors:

* https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/adt-chrome
* `INTEGRATION.adoc` in that folder

First-party patches (search-chat, nav-tree, Mermaid/lightbox, breadcrumb accordion) are landing with the `adtChromeBind` pattern so plain Antora sites still work.

*Question for the group:* would Antora be open to a short "Supplemental UI lifecycle" note in the docs (SoftNav optional, recommended hooks for persistent vs content-scoped scripts)? We are not proposing core Antora changes — only conventions for generated HTML + client scripts.

Happy to demo on the Facto stack site once the next publish lands.

— Ryan
