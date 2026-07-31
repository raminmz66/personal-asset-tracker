# Typography & Friend Copy Polish — Design

> **Status:** Approved (2026-07-31)  
> **Depends on:** [UI/UX design](./2026-07-31-personal-asset-custody-tracker-ui-design.md)  
> **Scope:** Type hierarchy + informal Persian copy + useful footers  
> **Out:** Layout redesign, new colors/IA, amounts on home rows, input border style overhaul

---

## 1. Goal

Phone screens feel unfinished mainly because **type roles are too similar** and **copy / footers sound like design notes or formal UI**. Polish hierarchy and speak like a friend (informal «تو»), without changing product IA or Calm notebook visuals.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Approach | Type scale + friend-copy pass (not layout rewrite) |
| Amount size | **Bolder** — balance hero ~`3.25rem` |
| Names | ~`1.2rem`, weight 700 — clearly above status |
| Status / meta | Quieter — status ~`0.8125rem`; footer/meta ~`0.75rem` |
| Actions | Primary text actions ~`0.9375rem` (e.g. + افزودن شخص) |
| Voice | Informal friend — «تو» not «شما» (e.g. نداری not ندارید) |
| Product nouns | Keep: امانت‌ها، موجودی، واریز، برگشت، تسویه، تسویه‌شده‌ها، افزودن موجودی، موجودی فعلی |
| Footers | **Counts** on list screens; **quiet or freshness** on Balance / Settings |
| Sync banner | Still top banner when offline/pending — informal wording; do not duplicate as footer when banner is showing |

---

## 3. Typography scale

Add CSS custom properties in `tokens.css` (or equivalent) and map existing classes to them:

| Token | Value | Use |
|---|---|---|
| `--text-amount` | `3.25rem` / weight 800 | Balance hero number |
| `--text-name` | `1.2rem` / weight 700 | Person names; balance labels on person list |
| `--text-title` | `1.125rem` / weight 800 | Screen headers |
| `--text-action` | `0.9375rem` / weight 700 | Text primary actions |
| `--text-status` | `0.8125rem` / weight 400 | Row status under names |
| `--text-meta` | `0.75rem` / weight 400 | Footers, section labels, sync banner |

Rules:

- On a row, **name > status** in size.
- On Balance, **amount** is the loudest element.
- Footers never compete with content.
- Fonts unchanged: Vazirmatn (+ existing Georgia titles where already used).

---

## 4. Copy voice

**Principles**

- Address the user as a friend (تو).
- Empty states: one short clear line.
- Lists/status: clipped, not sentences when a phrase works.
- Errors/confirms: still clear, but drop formal «شما» / «می‌دهید».
- Keep product vocabulary from the UI design spec.

### 4.1 Empty / helper (approved examples)

| Context | From | To |
|---|---|---|
| Person empty | موجودی فعالی نیست. | موجودی فعالی نداری |
| Home empty | هنوز کسی ثبت نشده. | هنوز کسی اضافه نکردی |
| Offline banner | شما آفلاین هستید. | آفلاینی — تغییرات اینجا می‌مونه |
| Settled empty | موجودی تسویه‌شده‌ای نیست. | چیزی تو تسویه‌شده‌ها نیست |

### 4.2 Other user-facing strings (same voice)

Rewrite remaining formal or stiff lines in web app routes/components/API error map to informal تو where they address the user. Examples:

| Area | Direction |
|---|---|
| Login lead | «رمزتو وارد کن» / setup: friend tone, not formal |
| Confirm import | Drop «ادامه می‌دهید؟» → e.g. «ادامه می‌دی؟» |
| Success toasts/lines | Keep short; avoid «با موفقیت» stacking if friend tone is enough (optional tighten) |
| Pending sync banner | Keep count; informal if it addresses user |
| `personShortStatus` | Keep «N موجودی فعال» / «تسویه» (already short; Persian digits via `toLocaleString('fa-IR')` at call site if not already) |

Domain validation messages that are system facts (e.g. over-return) may stay factual; prefer consistent friendly tone when they speak to the user.

### 4.3 Product nouns — do not rename

امانت‌ها · موجودی · واریز · برگشت · تسویه · تسویه‌شده‌ها · افزودن موجودی · موجودی فعلی · ذخیره · انصراف · افزودن

---

## 5. Footers

Replace design-note caps on all main screens.

| Screen | Footer content |
|---|---|
| **Home** | `{N} نفر · {M} موجودی فعال` (Persian digits). If zero people: omit count or show `۰ نفر` — prefer short empty-state body and a quiet `۰ نفر` only if list empty feels bare; otherwise hide strip content when N=0 and empty message shows. **Decision:** always show count line when people exist; when empty list, footer may show `۰ نفر` or stay blank — prefer **`۰ نفر`** for consistency. |
| **Person** | `{N} موجودی فعال` |
| **Settled** | `{N} تسویه‌شده` |
| **Balance** | **Quiet:** empty strip (or minimal spacer) when online and no pending sync and no need for freshness. **Freshness:** when useful and top sync banner is *not* covering the same fact — e.g. `همگام · ۵ دقیقه پیش` from last successful snapshot refresh. Do **not** repeat «آفلاینی» in footer if SyncBanner is visible. |
| **Settings** | Freshness line: `همگام · …` / or `ذخیره محلی` when offline with pending — short, friend tone |

### 5.1 Freshness data

Use snapshot `updatedAt` (already written on refresh) and/or a small `lastSyncedAt` exposed from SyncContext. Relative Persian phrasing is enough for v1 (e.g. «همین الان»، «۵ دقیقه پیش»، «امروز»). Exact helper can live next to Jalali utils or a tiny `formatRelativeFa`.

---

## 6. Implementation surface

| Area | Change |
|---|---|
| `apps/web/src/styles/tokens.css` | Type tokens |
| `apps/web/src/styles/global.css` | Map classes to tokens; bump sizes |
| Routes / components | String rewrites; footer content |
| `SyncBanner.tsx` | Informal offline/pending copy |
| `SyncContext` | Expose last sync time for footers if needed |
| `packages/domain` `personShortStatus` | Only if status wording changes (likely keep) |
| Tests | Update any assertions on Persian strings; add relative-time helper tests if added |

Mockups under `docs/superpowers/mockups/` may be updated to match footer/copy for consistency (optional in same pass if cheap).

---

## 7. Out of scope

- Cards, color palette changes, dashed-input redesign  
- Showing amounts on Home people rows  
- Bottom tabs / IA changes  
- Formal ↔ informal for non-user-facing logs  

---

## 8. Success criteria

- On phone: names clearly larger than status; balance amount reads as hero (~3.25rem).  
- No «شما» addressing the user in primary UI chrome.  
- No design-note footers («بدون قلم…», «پول نزد شما…»).  
- List footers show live counts; Balance quiet when fine; Settings shows freshness.  

---

## 9. Related

- UI design: [2026-07-31-personal-asset-custody-tracker-ui-design.md](./2026-07-31-personal-asset-custody-tracker-ui-design.md)  
- Companion brainstorm screens: `.superpowers/brainstorm/` (local)  
