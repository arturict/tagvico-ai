---
layout: home

hero:
  name: "Tagvico AI v2"
  text: "AI filing for Paperless-ngx, under your control"
  tagline: Self-hosted, reviewable AI metadata for Paperless-ngx with your choice of local or hosted model.
  image:
    src: /tagvico-icon.png
    alt: Tagvico AI
  actions:
    - theme: brand
      text: Install v2
      link: /installation
    - theme: alt
      text: Explore features
      link: /features
    - theme: alt
      text: Choose a provider
      link: /providers

features:
  - icon: 🗂️
    title: Structured filing
    details: Generate titles, tags, correspondents, document types, dates, languages, custom fields, and optional owner assignments.
  - icon: ✅
    title: Review first or automate
    details: Queue suggestions for approval or write validated metadata directly. Change modes without losing queued work.
  - icon: 🔌
    title: Your model, your boundary
    details: Use local Ollama, direct APIs, OpenRouter, Azure, compatible gateways, GitHub Copilot, or experimental ChatGPT subscription access.
  - icon: 📈
    title: Visible operations
    details: Inspect progress, processing history, usage, retries, OCR recovery, rescan actions, and metadata restoration from the web UI.
  - icon: 💬
    title: Optional Telegram access
    details: Give allowlisted family members natural-language search, cited downloads, follow-ups, and uploads through their own Paperless tokens.
---

## Start here

Tagvico AI is a self-hosted companion for an existing Paperless-ngx instance.
It reads OCR text already stored in Paperless, asks your chosen model for a
structured filing suggestion, validates that suggestion, and either queues it
for review or writes it back.

The v2 documentation is frozen under this URL when a future major version is
published. Use the version menu in the navigation to move between major
versions without losing the instructions that match your installation.

::: tip Stable v2
Version 2.0.1 is the current stable v2 release. Pin the immutable image version,
back up the data volume before upgrades, and start new installations in
**Review first** mode.
:::
