---
name: Light/dark mode (dark mode)
packageName: '@antora-supplemental/light-dark-mode'
purpose: pipeline
layer: chassis
description: Dark mode for any Antora UI - no-flash head hook, saved choice, system preference, accessible toggle (top-bar icon button or footer Light / Dark / Auto switch). Successor to antora-dark-mode.
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/light-dark-mode
---

# Overview

Light/dark (dark mode) switching for the Antora Default UI or any theme, with no colors of its own. Pair it with a paint: `@antora-supplemental/default-paint` on the Default UI.

## Install

```yaml
antora:
  extensions:
    - require: '@antora-supplemental/light-dark-mode'
      toggle_placement: navbar   # or footer
    - require: '@antora-supplemental/default-paint'
```

Git path pin: `github:antora-supplemental/antora-ui-chassis#light-dark-mode-v0.1.0&path:packages/light-dark-mode`
