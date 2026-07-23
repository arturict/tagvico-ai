---
layout: home

hero:
  name: "Tagvico v3"
  text: "The action center for your household documents"
  tagline: Turn Paperless-ngx documents into owned tasks, deadlines, decisions, and carefully approved AI assistance.
  image:
    src: /tagvico-icon.png
    alt: Tagvico AI
  actions:
    - theme: brand
      text: Install v3
      link: /installation
    - theme: alt
      text: Explore features
      link: /features
    - theme: alt
      text: Choose a provider
      link: /providers

features:
  - icon: 🗂️
    title: Action Center
    details: One durable case per Paperless document, with deadlines, priorities, assignees, and up to 100 checklist steps.
  - icon: ✅
    title: Household Companion
    details: Ask about documents and obligations. Reads execute immediately; every AI-proposed write waits for a human approval.
  - icon: 🔌
    title: Your model, your boundary
    details: Tagvico owns the safe harness. Use Vercel AI SDK providers such as OpenCode Go or an optional read-only Codex SDK adapter.
  - icon: 📈
    title: Visible operations
    details: Keep the established metadata automation, review queue, processing history, OCR recovery, retry controls, and restoration tools.
  - icon: 💬
    title: Optional Telegram access
    details: Give allowlisted family members cited search, uploads, action lists, and approve/reject controls through their own Paperless tokens.
---

## Start here

Tagvico is a self-hosted action layer for an existing Paperless-ngx instance.
It keeps Paperless as the document system of record while adding household
ownership, checklists, deadlines, approval history, and a provider-neutral AI
session runtime. Existing reviewable AI metadata filing remains available.

The v3 documentation is frozen under this URL when a future major version is
published. Use the version menu in the navigation to move between major
versions without losing the instructions that match your installation.

::: tip Production defaults
Pin the immutable `3.1.0` image after the release is published, back up the data volume before upgrades, and start new installations in
**Review first** mode. Companion writes are always approval-gated regardless
of the metadata processing mode.
:::
