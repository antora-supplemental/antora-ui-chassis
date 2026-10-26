---
name: Color scheme
packageName: '@antora-supplemental/color-scheme'
purpose: pipeline
layer: chassis
description: Color scheme layer - the --cs-* token contract and optional live paint (switch schemes at view time, light/dark slots, picker page). Dark mode switching is light-dark-mode.
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/color-scheme
---

# Overview

The token contract every chassis paint and layout meets on, plus opt-in live paint: switch color schemes on a built site, assign schemes to the light and dark slots, and offer a picker page. For the light/dark toggle (dark mode) use `@antora-supplemental/light-dark-mode`, which registers this package.

## Install

```yaml
antora:
  extensions:
    - require: '@antora-supplemental/color-scheme'
```

Git path pin: `github:antora-supplemental/antora-ui-chassis#color-scheme-v0.3.0&path:packages/color-scheme`
