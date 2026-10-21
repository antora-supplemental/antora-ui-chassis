---
name: SoftNavContext
packageName: '@antora-supplemental/soft-nav-context'
purpose: pipeline
layer: chassis
pipeline: true
description: Navigation context store for SoftNav — keeps persistent chrome aligned with each page
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/soft-nav-context
---

# Overview

SoftNav swaps mast, nav, and article without a full reload. **Persistent chrome** (search omnibox, dock) stays in the DOM while page context changes.

This Antora extension injects `#soft-nav-page-context` on each page and ships `soft-nav-context.js` + `bind-soft-nav-context.js` after `soft-nav.js`.

Integration guide: https://github.com/antora-supplemental/antora-ui-chassis/blob/main/packages/soft-nav-context/INTEGRATION.adoc

## Install

```yaml
antora:
  extensions:
    - require: '@antora-supplemental/soft-nav-context'
```

Git path pin (monorepo):

```text
github:antora-supplemental/antora-ui-chassis#chassis-v0.1.2&path:packages/soft-nav-context
```

Or register `@antora-supplemental/chassis-compose` to pull it in with one require.
