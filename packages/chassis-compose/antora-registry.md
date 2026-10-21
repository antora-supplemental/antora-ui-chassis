---
name: Chassis compose
packageName: '@antora-supplemental/chassis-compose'
purpose: pipeline
layer: chassis
pipeline: true
description: Meta Antora extension — registers chassis build-time extensions (soft-nav-context)
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/chassis-compose
---

# Overview

One playbook `require` wires chassis build-time extensions. Today the bundle registers `@antora-supplemental/soft-nav-context`.

Copy-only chassis assets (`soft-nav.js`, viewport helpers) stay manual — see the minimal example under `examples/minimal-soft-nav`.

## Install

```yaml
antora:
  extensions:
    - require: '@antora-supplemental/chassis-compose'
```

Git path pin:

```text
github:antora-supplemental/antora-ui-chassis#chassis-v0.1.0&path:packages/chassis-compose
```

Facto stack registers this member via `@antora-supplemental/facto-stack` (override key `softNavContext`).
