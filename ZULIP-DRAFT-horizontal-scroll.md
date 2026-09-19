Subject: (reply in) horizontal scroll for large tables

Hi Dan / all —

Coming back to this older thread because we just hit the same failure mode on a Valentus-themed site: a wide AsciiDoc table painted past the article measure and overlapped the right-hand TOC.

I re-read the 2021 guidance here (don't put max-width/overflow on the `<table>` itself; wrap with JS then style the wrapper; accessibility concerns led you to drop it from asciidoctor-docs-ui). Before we invent anything new, I wanted to check whether your current recommendation is still:

1. site-specific supplemental UI (wrapper div + CSS), and/or
2. widen the article column via custom UI,

…and whether anyone has landed on an accessible dual-scrollbar / other pattern you'd endorse for Default UI since then.

We're implementing the wrap-then-scroll approach in Valentus (antora-supplemental) first. Concrete bits, once CI is green:

- Valentus PR: https://github.com/antora-supplemental/valentus-theme/pull/19
- Site supplemental PR (docs.devcentr.org): https://github.com/dev-centr/docs/pull/4
- Isolated content-viewport demo: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/demos/content-viewport
- Chassis home (unthemed region contracts; Valentus/Default UI consume, don't own): https://github.com/antora-supplemental/antora-ui-chassis

Happy to drop or reshape any of this if there's a better maintained pattern I should reuse instead.

Thanks for the earlier write-up; it saved us from proposing the wrong layer.

— Ryan
