# Personal Asset Custody Tracker — UI/UX Design

> **Status:** Approved (2026-07-31); **amended 2026-07-31** (money-only hard cut)  
> **Depends on:** [Architecture & data design](./2026-07-30-personal-asset-custody-tracker-design.md) (Approved)  
> **Scope:** IA, screens, actions, visual system, states for **money custody only**  
> **Out:** Tools, belongings, قلم‌ها, item received/returned flows

---

## 1. Product UX north star

**Answer-first:** someone asks how much of their money you still hold → open app → person → balances in seconds.

Capture (واریز/برگشت) happens **after** choosing a person. Persian RTL, mobile-first PWA. Rare use, must feel immediate.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Primary job | Answer / lookup first |
| What we track | **Money balances only** (freeform labels) |
| Home | People list + short status; offline/unsynced banner when needed; **no** activity feed |
| People row | Name + short status (e.g. «۳ موجودی فعال» / «تسویه») |
| Capture location | Inside person screen only |
| Person layout | **Single list: موجودی‌ها** (+ افزودن موجودی) |
| Balance tap | Current amount + **history first**; واریز / برگشت |
| Settled | Hidden by default; «تسویه‌شده‌ها» at bottom of person |
| Settings | Gear on home header |
| Navigation | Drill-down: Home → Person → Balance |
| Visual | Calm notebook; accent `#0F6B6B` |
| Fonts | Vazirmatn body; Lalezar titles/names |
| Design system | None — custom components on CSS tokens |
| Dates | Jalali UI; Gregorian `YYYY-MM-DD` storage |

---

## 3. Information architecture

```
Login (password / PIN)
  → Home (people, settings gear, sync banner if needed)
      → Person (موجودی‌ها list, + افزودن موجودی, تسویه‌شده‌ها)
          → Balance (amount + history + واریز/برگشت)
          → Settled balances for that person
      → Settings (password, export, import)
```

No bottom tabs. No home FAB. No قلم / tools UI.

---

## 4. Screens & primary actions

### 4.1 Login
Password/PIN only.

### 4.2 Home
Title + ⚙ · people rows · subtle add person · sync banner when needed.

### 4.3 Person
- List of **active** balances (label + current amount)
- **+ افزودن موجودی** → label + amount + Jalali date (→ balance + initial deposit)
- **تسویه‌شده‌ها** at bottom

### 4.4 Balance
- موجودی فعلی on top
- واریز / برگشت
- تاریخچه (Jalali dates); tap row → edit
- Delete with one confirm

### 4.5 Settled
Balances with qty = 0; tap → same balance screen.

### 4.6 Settings
Change password · Export JSON · Import replace-all (strong confirm).

---

## 5. Visual system — Calm notebook

| Token | Value | Use |
|---|---|---|
| Page | `#F4EFE6` | Background |
| Ink | `#3D3428` | Text |
| Muted | `#6A5F50` | Secondary |
| Rule | `#CBBFAD` | Dividers |
| Accent | `#0F6B6B` | Actions / positive amounts |
| Danger | `#8B3A2F` | Destructive |

Typography: Persian RTL; Vazirmatn body; Lalezar for titles and names. Notebook rules over heavy cards. Light RTL push motion only.

Dates: Jalali display/picker; Gregorian at API boundary.

---

## 6. States & friction

- Empty people / empty balances / empty history: short Persian lines + primary add where relevant  
- Confirm only: delete person/balance/tx; import replace-all  
- Sync banner when offline or unsynced — no toast spam  

---

## 7. Copy principles

Preferred: موجودی فعلی، واریز، برگشت، موجودی، تسویه، تسویه‌شده‌ها، افزودن موجودی  

**Do not use** for v1: نزد من (item sense), افزودن قلم، قلم‌ها، دریافت قلم.

---

## 8. Related

Architecture domain rules (money balances only).  
Plan: [implementation plan](../plans/2026-07-31-personal-asset-custody-tracker.md).  
Mockups: [docs/superpowers/mockups/](../mockups/).
