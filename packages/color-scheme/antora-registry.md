---
name: Color scheme
packageName: '@antora-supplemental/color-scheme'
purpose: pipeline
layer: chassis
description: Unstyled light/dark mechanism - no-FOUC head hook, saved choice, system preference, accessible toggle. Replaces antora-dark-mode.
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/color-scheme
---

# Overview

The light/dark mechanism for any Antora UI, with no colors. It replaces `antora-dark-mode`, keeps its saved-choice keys, and leaves palettes to paint and toggle placement to the body kit.

## Install

```yaml
antora:
  extensions:
    - require: '@antora-supplemental/color-scheme'
```

Git path pin: `github:antora-supplemental/antora-ui-chassis#color-scheme-v0.1.0&path:packages/color-scheme`
