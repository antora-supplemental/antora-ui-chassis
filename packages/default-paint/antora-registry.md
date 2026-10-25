---
name: Default UI paint
packageName: '@antora-supplemental/default-paint'
purpose: pipeline
layer: paint
description: Paint layer - light and dark palette for the Antora Default UI, driven by the chassis color-scheme mechanism. Colors only.
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/default-paint
---

# Overview

Light and dark colors for sites on the stock Antora Default UI. Light mode keeps the Default UI's own colors; dark mode is the palette ported from `antora-dark-mode`. It is paint only: register `@antora-supplemental/color-scheme` for the mechanism and toggle.

## Install

```yaml
antora:
  extensions:
    - require: '@antora-supplemental/color-scheme'
    - require: '@antora-supplemental/default-paint'
```

Git path pin: `github:antora-supplemental/antora-ui-chassis#default-paint-v0.1.1&path:packages/default-paint`
