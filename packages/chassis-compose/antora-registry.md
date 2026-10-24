---
name: Chassis compose
packageName: '@antora-supplemental/chassis-compose'
purpose: pipeline
layer: chassis
pipeline: true
description: Meta Antora extension - registers ui-bus, soft-nav and page-state
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/chassis-compose
---

# Overview

One playbook `require` wires chassis build-time extensions. It registers `@antora-supplemental/ui-bus`, `@antora-supplemental/soft-nav` and `@antora-supplemental/page-state`, in that order.

Copy-only chassis assets (viewport helpers) stay manual. See the minimal example under `examples/minimal-soft-nav`.

## Install

```yaml
antora:
  extensions:
    - require: '@antora-supplemental/chassis-compose'
```

Git path pin:

```text
github:antora-supplemental/antora-ui-chassis#chassis-v0.2.0&path:packages/chassis-compose
```

Facto stack registers these members via `@antora-supplemental/facto-stack` (override keys `uiBus`, `softNav`, `pageState`).
