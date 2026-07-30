# Personal Asset Custody Tracker — UI/UX Design

> **Status:** Draft for review  
> **Date:** 2026-07-31  
> **Depends on:** [Architecture & data design](./2026-07-30-personal-asset-custody-tracker-design.md) (Approved)  
> **Scope:** Information architecture, screens, actions, visual system, states  
> **Deferred:** Exact font files (see §7), pixel-perfect spacing scale, final microcopy polish

---

## 1. Product UX north star

The app is **answer-first**: when someone asks what you hold for them, open the app → find the person → see current state in seconds.

Capture (ثبت) is secondary and happens **after** choosing a person — not from a home FAB.

Usage is rare (~2–3×/month) but must feel immediate and trustworthy. Persian RTL, mobile-first PWA.

---

## 2. Locked decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Primary job | Answer / lookup first |
| Home content | People list + offline/unsynced banner when needed; **no** activity feed |
| People row | Name + short status (e.g. «۳ دارایی فعال» / «تسویه») |
| Capture location | Inside person screen only (for v1) |
| Person layout | **موجودی‌ها** section first, then **قلم‌ها** |
| Add actions | Per section: «+ افزودن موجودی» / «+ افزودن قلم» |
| Asset tap | Current state + **history first**; deposit/return as controls on that screen |
| Settled assets | Hidden by default; «تسویه‌شده‌ها» link at bottom of person screen |
| Settings | Gear icon on home header |
| Navigation approach | **Drill-down ledger**: Home → Person → Asset |
| Visual personality | Calm notebook |
| Accent | Deep teal `#0F6B6B` |
| Fonts | Deferred — candidate **VazirMatn** (decide at frontend start / first UI polish) |

---

## 3. Information architecture

```
Login (password / PIN)
  → Home (people list, settings gear, sync banner if needed)
      → Person (balances section, items section, settled link)
          → Asset (current state + history + deposit/return or item actions)
          → Settled list (same person; settled assets only)
      → Settings (password, export, import)
```

No bottom tab bar. No home quick-add. No recent-activity feed in v1.

---

## 4. Screens & primary actions

### 4.1 Login
- Password/PIN entry only
- No marketing chrome

### 4.2 Home
- Header: app title + settings gear
- List of people: name + short status
- Subtle control to add a person (must not dominate lookup)
- Banner only when offline or local write queue unsynced

### 4.3 Person
- Header: person name
- Section **موجودی‌ها** with `+ افزودن موجودی`
- Section **قلم‌ها** with `+ افزودن قلم`
- Active assets only in default view
- Tap asset → Asset screen
- Bottom link: **تسویه‌شده‌ها**

### 4.4 Asset
- Current amount (balance) or status (item) on top
- Actions: balances → واریز / برگشت; items → received/returned transitions as appropriate
- History list below; tap transaction → edit
- Destructive delete (asset or transaction) with one confirmation

### 4.5 Settled
- Lists settled balances (qty = 0) and returned items for that person
- Tap → same Asset screen pattern (history accessible for trust)

### 4.6 Settings
- Change password/PIN
- Export JSON
- Import JSON (replace-all) with strong confirmation

---

## 5. Visual system — Calm notebook

### 5.1 Color tokens

| Token | Value | Use |
|---|---|---|
| Page | `#F4EFE6` | App background |
| Ink | `#3D3428` | Primary text |
| Muted | `#6A5F50` | Secondary text, labels |
| Rule | `#CBBFAD` | Dividers (prefer dashed rules over heavy cards) |
| Accent | `#0F6B6B` | Links, primary buttons, positive amounts |
| Danger | `#8B3A2F` | Delete / import-destructive only |

Avoid: purple gradients, loud pill clusters, multi-layer card shadows, emoji decoration.

### 5.2 Typography
- UI language: Persian only, RTL
- **Font files not locked.** Default candidate: [VazirMatn](https://github.com/rastikerdar/vazirmatn)
- **When to decide:** at the start of frontend implementation, or immediately before the first polished UI pass — does **not** block architecture work or the implementation plan
- Until then: system stack / Tahoma acceptable in wireframes
- Amounts: stronger weight; tabular numbers where feasible

### 5.3 Shape & density
- Notebook-like: rules and spacing over floating cards
- Small corner radii on controls (not bubbly)
- Comfortable tap targets; denser than airy “soft modern”

### 5.4 Motion
- Simple RTL-aware push navigation
- Sync banner show/hide
- No celebratory or decorative motion

---

## 6. States & friction

### Empty
- No people: one short line + add person
- Person with no assets: empty sections still show their add actions
- No transactions: «هنوز تراکنشی ثبت نشده»

### Confirms
Only for destructive actions:
- Delete person / asset / transaction
- Import replace-all  

No confirm on normal deposit/return.

### Sync
- Silent when healthy
- Home banner when offline or unsynced
- No toast spam

---

## 7. Copy principles

- Short, concrete, ledger tone — not marketing
- Preferred terms: موجودی فعلی، واریز، برگشت، نزد من، تسویه‌شده، تسویه‌شده‌ها
- Errors: one line — what failed + what to do

Final microcopy polish happens during implementation.

---

## 8. Relationship to architecture spec

Domain rules (balance vs item, deposit/return, settled detection, export/import, offline queue) remain as defined in the architecture design. This document only specifies **how** those concepts appear and are acted on in the UI.

---

## 9. Out of scope for this UI spec

- Frontend framework choice
- Exact component library
- Final font packaging and CDN/self-host details
- Desktop layout refinements beyond “usable”
- Accessibility audit checklist (follow platform defaults; deepen in implementation if needed)

---

## 10. Next steps

1. User reviews this UI spec  
2. Implementation plan (`writing-plans`) covering architecture + UI  
3. **Font decision** at frontend kickoff (VazirMatn unless a better Persian UI face is chosen then)
