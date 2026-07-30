# Personal Asset Custody Tracker

## Product Discovery & Requirements Document (Brainstorming Draft)

> **Status:** Discovery Complete (v1)
>
> **Purpose:** This document summarizes the product vision, discovered requirements, assumptions, constraints, and design goals before any brainstorming or implementation begins.

---

# 1. Background

I frequently keep assets that belong to other people.

These assets may include:

* Cash
* Iranian Toman
* Foreign currencies
* Cryptocurrency (USDT, etc.)
* Physical tools
* Personal belongings
* Potentially other asset types in the future

The goal is **not accounting**.

The goal is to always know:

* Who owns what
* What is currently in my custody
* What has already been returned
* What remains
* The history of changes

without relying on memory.

---

# 2. Core Problem

The biggest problem is **memory**, not finance.

Typical situations include:

* Someone asks:

  * "How much USDT do I have with you?"
* Someone requests part of their money back.
* I want to know how much has already been returned.
* I cannot remember whether I lent a specific tool to someone.
* I know I recorded something somewhere, but I don't remember where.

The product should become the **single source of truth**.

---

# 3. Product Vision

Create a very small, extremely fast personal application that replaces memory for assets held on behalf of other people.

The application should prioritize:

* Speed
* Simplicity
* Reliability

instead of accounting features.

---

# 4. Primary Users

Only myself.

This is not intended to become:

* SaaS
* Multi-user software
* Team software
* Marketplace

The application is optimized for one person.

---

# 5. Scale

Very small.

Expected contacts:

5–10 people.

This number is expected to remain stable.

Therefore the product should optimize UX instead of scalability.

---

# 6. Primary Goal

Whenever someone asks about their assets, I should be able to answer confidently within seconds.

Examples:

* How much money do you have for me?
* How much USDT do I still have?
* Is my tool still with you?
* How much have you already returned?

---

# 7. What the Product is NOT

This is NOT:

* Accounting software
* Personal finance manager
* Expense tracker
* Investment tracker
* Portfolio tracker
* Crypto wallet
* Inventory management
* ERP

Those products solve different problems.

---

# 8. Supported Asset Types

Examples include:

* Toman
* USD
* EUR
* USDT
* BTC
* Physical tools
* Personal belongings

The design should allow adding new asset types easily.

---

# 9. Ownership Rules

Each asset belongs to exactly one person.

No shared ownership.

No percentage ownership.

No split ownership.

---

# 10. Asset Rules

A single person may have multiple assets simultaneously.

Example:

John

* 10,000,000 Toman
* 250 USDT
* One Drill

Each asset has its own independent history.

---

# 11. Transaction Rules

Transactions modify an asset.

Examples:

* Deposit
* Partial return
* Full return
* Manual adjustment

Each transaction contains:

* Amount (or quantity)
* Exact date
* Optional note

Nothing more.

---

# 12. Current State vs History

Current state is the primary information.

History is secondary.

Typical workflow:

Current Balance

↓

If necessary

↓

Open transaction history

---

# 13. Editing

Editing should be simple.

If a mistake is made, I want to edit it directly.

Audit logs are unnecessary.

Immutable accounting records are unnecessary.

---

# 14. Deletion

Permanent deletion is acceptable.

Soft Delete is unnecessary.

Trash is unnecessary.

Archive is unnecessary.

---

# 15. Security

Security is useful but not critical.

Examples:

* PIN
* App Lock
* Biometrics

Enterprise-grade security is unnecessary.

---

# 16. Backup

Manual online backup is preferred.

Automatic backup is optional.

Offline export (JSON/CSV) is not important for everyday usage.

---

# 17. Notifications

No reminders.

No scheduled notifications.

No alerts.

The application is passive.

Information appears only when requested.

---

# 18. Data Entry Philosophy

Fast manual entry.

AI parsing is unnecessary.

Natural language input is unnecessary.

Forms should require as few fields as possible.

---

# 19. Mobile First

The phone is almost always available.

Therefore:

The mobile experience is the primary experience.

Desktop is optional.

---

# 20. UX Principles

Highest priority:

* Extremely fast capture
* Minimal friction
* Simple navigation
* Clear current state
* Reliable information

Avoid:

* Complex workflows
* Long forms
* Hidden interactions
* Multiple confirmation dialogs

---

# 21. Home Screen Philosophy

The home screen should optimize the two most common actions.

Likely priorities:

1. Quick Add
2. Recent Activity

Everything else is secondary.

---

# 22. Search

Because the number of contacts is small:

Either of these is acceptable:

* Small contact list
* Quick search

Search is convenient but not mandatory.

---

# 23. Frequency of Usage

Expected usage:

2–3 times per month.

However,

When used,

The answer must be immediate.

---

# 24. Data Model (Conceptual)

Person

↓

Assets

↓

Transactions

Each Asset has:

* Current state
* Transaction history

---

# 25. Edge Cases

The application should support:

* Partial returns
* Multiple assets per person
* Exact transaction dates
* Optional notes
* Editing mistakes
* Permanent deletion
* Manual cloud backup
* Independent histories per asset

---

# 26. Success Criteria

The product is successful if:

* I never need to rely on memory.
* I always know who owns what.
* Recording new information takes only a few seconds.
* I can answer ownership questions immediately.
* I fully trust the stored information.

---

# 27. Product Philosophy

The product should act as an external memory.

Its purpose is not to manage money.

Its purpose is to preserve trust by ensuring accurate knowledge of assets held for other people.

Everything that does not contribute to that goal should be questioned before being implemented.

