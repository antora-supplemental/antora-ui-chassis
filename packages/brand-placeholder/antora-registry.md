---
name: Brand placeholder (placeholder logo)
packageName: '@antora-supplemental/brand-placeholder'
purpose: pipeline
layer: chassis
description: Shared placeholder logo and favicons for every Antora theme, with header_logo/favicon resolution. Sites replace it; themes never ship a brand logo.
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/brand-placeholder
---

# Overview

A neutral placeholder mark, favicons and the `brand-logo` / `head-icons` partials. Override order: the site's keys and files first, then this placeholder.

## Install

```yaml
antora:
  extensions:
    - require: '@antora-supplemental/brand-placeholder'
```
