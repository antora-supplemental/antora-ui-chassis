---
name: Contrast check
packageName: '@antora-supplemental/contrast-check'
purpose: ci
layer: chassis
description: CI contrast checker for Antora sites - axe color-contrast plus token-pair, link, focus, hover and icon checks in every color scheme a paint declares, with GitHub annotations and a step summary.
homepage: https://github.com/antora-supplemental/antora-ui-chassis/tree/main/packages/contrast-check
---

# Overview

Runs a built site in Chrome once per color scheme (from the paint's `@color-schemes` manifest) and reports WCAG AA failures as errors and near misses as warnings, each with a lightness-only suggested color. CLI, API and a composite GitHub Action.

## Install

Git path pin: `github:antora-supplemental/antora-ui-chassis#contrast-check-v0.1.0&path:packages/contrast-check`

Action: `antora-supplemental/antora-ui-chassis/packages/contrast-check@contrast-check-v0.1.0`
