---
layout: home

hero:
  name: "Tagvico v3.4"
  text: "The Action Center for Paperless-ngx"
  tagline: Paperless files it — Tagvico makes sure someone acts on it. Deadlines, households, approvals, and research with every sensitive change visible.
  image:
    src: /tagvico-icon.png
    alt: Tagvico AI
  actions:
    - theme: brand
      text: Install v3.4.1
      link: /installation
    - theme: alt
      text: Explore features
      link: /features
    - theme: alt
      text: Choose a provider
      link: /providers

features:
  - icon: 🗂️
    title: Documents to assigned work
    details: One Action Case per document with owner, due date, priority, and up to 100 checklist steps — tracked to done, not just filed.
  - icon: ✅
    title: Ask Tagvico
    details: Ask about documents and obligations while every Paperless search, document read and proposed write stays visible and approval-gated.
  - icon: 💬
    title: Optional Telegram access
    details: Give allowlisted family members cited search, uploads, action lists, and approve/reject controls through their own Paperless tokens.
  - icon: 🎮
    title: Optional Discord access
    details: Same capabilities as Telegram for allowlisted Discord users — DMs and one optional server channel — with no privileged Message Content intent required.
  - icon: 🔌
    title: Your model, your boundary
    details: Tagvico owns the safe harness. Use Vercel AI SDK providers such as OpenCode Go or an optional read-only Codex SDK adapter.
  - icon: 📈
    title: Included filing utility
    details: Opt-in reviewable metadata filing with a review queue, processing history, OCR recovery, retry controls, and restoration tools — or use Paperless-ngx v3's native AI instead.
---

## Start here

Tagvico is a self-hosted action layer for an existing Paperless-ngx instance.
It keeps Paperless as the document system of record while adding household
ownership, checklists, deadlines, approval history, and a provider-neutral AI
session runtime.

Reviewable AI metadata filing remains available as an opt-in utility.
Paperless-ngx v3 ships native AI metadata suggestions of its own; use either,
but do not run both in automatic write mode against the same fields — see
[Features](./features#included-utility-reviewable-metadata-filing) for the
coexistence guidance.

This page tracks the latest stable v3 patch release. The version menu keeps
older major-version guides available, while [Release notes](./release-notes)
shows exactly what changed in v3.4.

::: tip Production defaults
Pin the immutable `3.4.1` image, back up the data volume before upgrades, and start new installations in
**Review first** mode. Companion writes are always approval-gated regardless
of the metadata processing mode.
:::
