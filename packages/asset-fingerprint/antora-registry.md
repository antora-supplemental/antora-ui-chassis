---
name: Asset Fingerprint
packageName: '@antora-supplemental/asset-fingerprint'
purpose: pipeline
layer: chassis
description: Cache-busting for any Antora site. Rewrites CSS/JS (optionally font/img) URLs in the built HTML to ?v=<content hash> so deploys show up at once.
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/asset-fingerprint
---

# Overview

Static hosts such as GitHub Pages serve `_/css/site.css` with a cache max-age (4 hours on Pages) and an unchanging name, so visitors keep an old stylesheet after a deploy. This extension runs after Antora writes the site and appends `?v=<hash of the file>` to each matching `href`/`src`. A changed file gets a new URL; an unchanged one keeps its URL and stays cached.

## Install

```yaml
antora:
  extensions:
    - require: '@antora-supplemental/asset-fingerprint'
```

Or after any build: `npx asset-fingerprint build/site`.
