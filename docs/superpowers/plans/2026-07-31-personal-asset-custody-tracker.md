# Personal Asset Custody Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Persian RTL PWA on Cloudflare (Pages + Workers + D1) that lets one person answer “what do I hold for X?” in seconds, with offline cache and JSON export/import.

**Architecture:** Shared pure domain package (ledger math, validation, export schema) tested with Vitest. Hono Worker API owns auth + D1 CRUD. React/Vite PWA is answer-first drill-down UI with IndexedDB snapshot cache and ordered offline write queue (last-write-wins).

**Tech Stack:** TypeScript, npm workspaces, Vitest, Hono, Cloudflare Workers + D1 + Pages, Wrangler, React 19, React Router 7, Vite, `vite-plugin-pwa`, `idb`, Web Crypto (PBKDF2 + HMAC session), Vazirmatn (font decision at Task 11), Jalali UI dates via `react-multi-date-picker` + `dayjs` (or equivalent) with Gregorian `YYYY-MM-DD` at the API boundary. **No third-party visual design system** — custom components on CSS tokens.

## Global Constraints

- Single user only; password/PIN auth; no OAuth
- Persian UI only, `dir="rtl"`
- Cloudflare free tier
- No `adjust` transactions; edit/delete mistakes
- Permanent delete only; cascade person→assets→transactions
- Return cannot exceed current balance; illegal item transitions rejected
- Export/import versioned JSON; import is replace-all or reject entirely
- Calm notebook tokens: page `#F4EFE6`, ink `#3D3428`, muted `#6A5F50`, rule `#CBBFAD`, accent `#0F6B6B`, danger `#8B3A2F`
- No activity feed, no home FAB, no notifications
- **No MUI/Mantine/Chakra/shadcn visual kit** — bespoke notebook UI
- **Dates:** Jalali display/picker in UI; store/transmit Gregorian `YYYY-MM-DD`
- Specs: `docs/superpowers/specs/2026-07-30-personal-asset-custody-tracker-design.md`, `docs/superpowers/specs/2026-07-31-personal-asset-custody-tracker-ui-design.md`

---

## File structure (create)

```
package.json                          # workspaces root
tsconfig.base.json
packages/domain/
  package.json
  tsconfig.json
  src/types.ts                        # Person, Asset, Transaction, ExportDoc
  src/ledger.ts                       # balance qty, item status, settled?
  src/validate.ts                     # mutation validation
  src/export-schema.ts                # build/parse/validate export JSON
  src/status.ts                       # person short status string helpers
  src/index.ts
  tests/*.test.ts
apps/api/
  package.json
  tsconfig.json
  wrangler.toml
  migrations/0001_init.sql
  src/index.ts                        # Hono app entry
  src/env.ts                          # Env bindings types
  src/db.ts                           # D1 helpers
  src/auth.ts                         # password + session cookie
  src/routes/auth.ts
  src/routes/people.ts
  src/routes/assets.ts
  src/routes/transactions.ts
  src/routes/backup.ts
  tests/*.test.ts                     # domain-facing route tests where feasible
apps/web/
  package.json
  vite.config.ts
  index.html
  public/manifest.webmanifest
  src/main.tsx
  src/App.tsx
  src/styles/tokens.css
  src/api/client.ts
  src/dates/jalali.ts                 # toGregorianDateString / formatJalali / todayJalali
  src/components/JalaliDateField.tsx  # react-multi-date-picker wrapper, notebook-styled
  src/sync/cache.ts                   # idb snapshot
  src/sync/outbox.ts                  # ordered offline queue
  src/sync/flush.ts
  src/routes/Login.tsx
  src/routes/Home.tsx
  src/routes/Person.tsx
  src/routes/Asset.tsx
  src/routes/Settled.tsx
  src/routes/Settings.tsx
  src/components/*.tsx                # bespoke; no design-system package
README.md                             # update run/deploy
```

---

### Task 1: Monorepo scaffold + domain types

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/types.ts`, `packages/domain/src/index.ts`, `packages/domain/tests/types-smoke.test.ts`
- Modify: `README.md` (dev scripts section)

**Interfaces:**
- Produces: exported types `Person`, `BalanceAsset`, `ItemAsset`, `Asset`, `BalanceTx`, `ItemTx`, `Transaction`, `ExportDoc`

- [ ] **Step 1: Create root workspace**

```json
{
  "name": "personal-asset-tracker",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "npm run test -w @pat/domain",
    "test:all": "npm run test --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Add domain package with Vitest and types**

```ts
// packages/domain/src/types.ts
export type Person = {
  id: string;
  name: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BalanceAsset = {
  id: string;
  personId: string;
  kind: "balance";
  label: string;
  createdAt: string;
  updatedAt: string;
};

export type ItemAsset = {
  id: string;
  personId: string;
  kind: "item";
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Asset = BalanceAsset | ItemAsset;

export type BalanceTx = {
  id: string;
  assetId: string;
  type: "deposit" | "return";
  amount: number;
  date: string; // YYYY-MM-DD
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemTx = {
  id: string;
  assetId: string;
  type: "received" | "returned";
  date: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Transaction = BalanceTx | ItemTx;

export type ExportDoc = {
  schemaVersion: 1;
  exportedAt: string;
  people: Person[];
  assets: Asset[];
  transactions: Transaction[];
};
```

- [ ] **Step 3: Write smoke test and run**

```ts
// packages/domain/tests/types-smoke.test.ts
import { describe, it, expect } from "vitest";
import type { ExportDoc } from "../src/types";

describe("types", () => {
  it("export doc schemaVersion is 1", () => {
    const doc: ExportDoc = {
      schemaVersion: 1,
      exportedAt: "2026-07-31T00:00:00.000Z",
      people: [],
      assets: [],
      transactions: [],
    };
    expect(doc.schemaVersion).toBe(1);
  });
});
```

Run: `npm install && npm run test -w @pat/domain`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.base.json packages/domain README.md package-lock.json
git commit -m "chore: scaffold workspaces and domain types"
```

---

### Task 2: Ledger math + settled detection

**Files:**
- Create: `packages/domain/src/ledger.ts`, `packages/domain/tests/ledger.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: `BalanceTx`, `ItemTx`, `Asset`
- Produces:
  - `balanceQuantity(txs: BalanceTx[]): number`
  - `itemStatus(txs: ItemTx[]): "in_custody" | "returned" | "none"`
  - `isBalanceSettled(qty: number): boolean`
  - `isItemSettled(status: "in_custody" | "returned" | "none"): boolean`
  - `isAssetActive(asset: Asset, txs: Transaction[]): boolean`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { balanceQuantity, itemStatus, isAssetActive } from "../src/ledger";
import type { BalanceTx, ItemTx, BalanceAsset, ItemAsset } from "../src/types";

const base = {
  id: "t1",
  assetId: "a1",
  date: "2026-07-01",
  note: null,
  createdAt: "",
  updatedAt: "",
};

describe("balanceQuantity", () => {
  it("sums deposits minus returns", () => {
    const txs: BalanceTx[] = [
      { ...base, id: "1", type: "deposit", amount: 200 },
      { ...base, id: "2", type: "return", amount: 50 },
      { ...base, id: "3", type: "deposit", amount: 100 },
    ];
    expect(balanceQuantity(txs)).toBe(250);
  });

  it("is zero with no txs", () => {
    expect(balanceQuantity([])).toBe(0);
  });
});

describe("itemStatus", () => {
  it("tracks last transition", () => {
    const txs: ItemTx[] = [
      { ...base, id: "1", type: "received" },
      { ...base, id: "2", type: "returned" },
    ];
    expect(itemStatus(txs)).toBe("returned");
  });
});

describe("isAssetActive", () => {
  it("hides zero balance and returned items", () => {
    const bal: BalanceAsset = {
      id: "a1",
      personId: "p1",
      kind: "balance",
      label: "USDT",
      createdAt: "",
      updatedAt: "",
    };
    const item: ItemAsset = {
      id: "a2",
      personId: "p1",
      kind: "item",
      name: "دریل",
      createdAt: "",
      updatedAt: "",
    };
    expect(isAssetActive(bal, [])).toBe(false);
    expect(
      isAssetActive(item, [{ ...base, id: "1", assetId: "a2", type: "returned" }]),
    ).toBe(false);
    expect(
      isAssetActive(item, [{ ...base, id: "1", assetId: "a2", type: "received" }]),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm run test -w @pat/domain`  
Expected: FAIL module not found / exports missing

- [ ] **Step 3: Implement `ledger.ts`**

```ts
import type { Asset, BalanceTx, ItemTx, Transaction } from "./types";

export function balanceQuantity(txs: BalanceTx[]): number {
  return txs.reduce((q, t) => {
    if (t.type === "deposit") return q + t.amount;
    if (t.type === "return") return q - t.amount;
    return q;
  }, 0);
}

export function itemStatus(txs: ItemTx[]): "in_custody" | "returned" | "none" {
  if (txs.length === 0) return "none";
  const ordered = [...txs].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const last = ordered[ordered.length - 1];
  return last.type === "received" ? "in_custody" : "returned";
}

export function isBalanceSettled(qty: number): boolean {
  return qty === 0;
}

export function isItemSettled(
  status: "in_custody" | "returned" | "none",
): boolean {
  return status === "returned" || status === "none";
}

export function isAssetActive(asset: Asset, allTxs: Transaction[]): boolean {
  if (asset.kind === "balance") {
    const txs = allTxs.filter(
      (t): t is BalanceTx => t.assetId === asset.id && "amount" in t,
    );
    return !isBalanceSettled(balanceQuantity(txs));
  }
  const txs = allTxs.filter(
    (t): t is ItemTx => t.assetId === asset.id && !("amount" in t),
  );
  return itemStatus(txs) === "in_custody";
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test -w @pat/domain`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): add ledger quantity and settled detection"
```

---

### Task 3: Mutation validation

**Files:**
- Create: `packages/domain/src/validate.ts`, `packages/domain/tests/validate.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces:
  - `assertBalanceReturnAllowed(currentQty: number, returnAmount: number): void` (throws `ValidationError`)
  - `assertPositiveAmount(amount: number): void`
  - `assertItemTransition(current: "in_custody" | "returned" | "none", next: "received" | "returned"): void`
  - `class ValidationError extends Error { code: string }`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  assertBalanceReturnAllowed,
  assertPositiveAmount,
  assertItemTransition,
  ValidationError,
} from "../src/validate";

describe("validation", () => {
  it("rejects non-positive amounts", () => {
    expect(() => assertPositiveAmount(0)).toThrow(ValidationError);
  });

  it("rejects over-return", () => {
    expect(() => assertBalanceReturnAllowed(50, 51)).toThrow(ValidationError);
  });

  it("allows exact full return", () => {
    expect(() => assertBalanceReturnAllowed(50, 50)).not.toThrow();
  });

  it("rejects returned when already returned", () => {
    expect(() => assertItemTransition("returned", "returned")).toThrow(
      ValidationError,
    );
  });

  it("rejects received when already in custody", () => {
    expect(() => assertItemTransition("in_custody", "received")).toThrow(
      ValidationError,
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test -w @pat/domain -- tests/validate.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
export class ValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function assertPositiveAmount(amount: number): void {
  if (!(amount > 0) || Number.isNaN(amount)) {
    throw new ValidationError("invalid_amount", "مبلغ باید بزرگ‌تر از صفر باشد");
  }
}

export function assertBalanceReturnAllowed(
  currentQty: number,
  returnAmount: number,
): void {
  assertPositiveAmount(returnAmount);
  if (returnAmount > currentQty) {
    throw new ValidationError(
      "over_return",
      "برگشت نمی‌تواند از موجودی فعلی بیشتر باشد",
    );
  }
}

export function assertItemTransition(
  current: "in_custody" | "returned" | "none",
  next: "received" | "returned",
): void {
  if (next === "received" && current === "in_custody") {
    throw new ValidationError("illegal_transition", "این قلم هم‌اکنون نزد شماست");
  }
  if (next === "returned" && current !== "in_custody") {
    throw new ValidationError("illegal_transition", "این قلم برای برگشت در دسترس نیست");
  }
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): add mutation validation rules"
```

---

### Task 4: Export / import document schema

**Files:**
- Create: `packages/domain/src/export-schema.ts`, `packages/domain/tests/export-schema.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces:
  - `EXPORT_SCHEMA_VERSION = 1`
  - `buildExportDoc(people, assets, transactions): ExportDoc`
  - `parseExportDoc(raw: unknown): ExportDoc` (throws `ValidationError` on bad/unknown version)

- [ ] **Step 1: Write failing tests for valid parse, unknown version, missing arrays**

```ts
import { describe, it, expect } from "vitest";
import { buildExportDoc, parseExportDoc } from "../src/export-schema";
import { ValidationError } from "../src/validate";

describe("export schema", () => {
  it("round-trips empty doc", () => {
    const doc = buildExportDoc([], [], []);
    expect(parseExportDoc(doc).schemaVersion).toBe(1);
  });

  it("rejects unknown version", () => {
    expect(() =>
      parseExportDoc({ schemaVersion: 99, people: [], assets: [], transactions: [] }),
    ).toThrow(ValidationError);
  });

  it("rejects non-object", () => {
    expect(() => parseExportDoc(null)).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement parse with structural checks** (`schemaVersion === 1`, arrays present; deep field checks for each entity id/name/kind/type)

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): versioned export/import document schema"
```

---

### Task 5: Person status helper

**Files:**
- Create: `packages/domain/src/status.ts`, `packages/domain/tests/status.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `personShortStatus(activeCount: number): string`  
  - `activeCount > 0` → `"${n} دارایی فعال"` (use Persian digits optional later)  
  - else → `"تسویه"`

- [ ] **Step 1: Failing tests for active and settled strings**
- [ ] **Step 2: Implement + PASS**
- [ ] **Step 3: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): person short status labels"
```

---

### Task 6: API app + D1 schema

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/wrangler.toml`, `apps/api/migrations/0001_init.sql`, `apps/api/src/env.ts`, `apps/api/src/index.ts`, `apps/api/src/db.ts`

**Interfaces:**
- Produces: Hono app mounted at `/api`, D1 binding `DB`, tables `settings`, `people`, `assets`, `transactions`

- [ ] **Step 1: Add `apps/api` with Hono + wrangler deps** (`hono`, `wrangler`, `@cloudflare/workers-types`, workspace dep on `@pat/domain`)

- [ ] **Step 2: Write migration**

```sql
-- apps/api/migrations/0001_init.sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('balance', 'item')),
  label TEXT,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount REAL,
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_assets_person ON assets(person_id);
CREATE INDEX idx_tx_asset ON transactions(asset_id);
```

- [ ] **Step 3: Minimal Worker**

```ts
// apps/api/src/index.ts
import { Hono } from "hono";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();
app.get("/api/health", (c) => c.json({ ok: true }));
export default app;
```

```toml
# apps/api/wrangler.toml
name = "personal-asset-tracker-api"
main = "src/index.ts"
compatibility_date = "2026-07-01"

[[d1_databases]]
binding = "DB"
database_name = "pat-db"
database_id = "local-dev-placeholder"
migrations_dir = "migrations"
```

- [ ] **Step 4: Local migrate + health check**

Run:
```bash
npm install
cd apps/api && npx wrangler d1 migrations apply pat-db --local
npx wrangler dev
```
Expected: `GET /api/health` → `{ ok: true }`

- [ ] **Step 5: Commit**

```bash
git add apps/api package-lock.json
git commit -m "feat(api): scaffold Hono worker and D1 schema"
```

---

### Task 7: Auth (setup, login, session, logout)

**Files:**
- Create: `apps/api/src/auth.ts`, `apps/api/src/routes/auth.ts`, `apps/api/tests/auth.test.ts` (unit-test pure helpers with vitest; hash/verify with Web Crypto in worker-compatible tests or extracted pure functions)
- Modify: `apps/api/src/index.ts`, `apps/api/wrangler.toml` (vars: none; secrets: `SESSION_SECRET` via `.dev.vars`)

**Interfaces:**
- Produces routes:
  - `GET /api/auth/status` → `{ setupRequired: boolean, authenticated: boolean }`
  - `POST /api/auth/setup` body `{ password: string }` (only if no password hash)
  - `POST /api/auth/login` body `{ password: string }` → Set-Cookie `session`
  - `POST /api/auth/logout`
  - `POST /api/auth/password` body `{ currentPassword, newPassword }` (authed)
- Session: HTTP-only `Secure` `SameSite=Lax` cookie, HMAC-signed payload `{ exp }`, TTL 30 days
- Password: PBKDF2-SHA256, random salt, store in `settings` key `password_hash`

- [ ] **Step 1: Implement `hashPassword` / `verifyPassword` / `signSession` / `verifySession` in `auth.ts` with vitest coverage for verify true/false and expired session**

- [ ] **Step 2: Wire routes; wrong password returns 401 with `{ error: "invalid_credentials" }` and no data**

- [ ] **Step 3: Manual local test with curl: setup → login → status authenticated → logout**

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "feat(api): password setup, login session, logout"
```

---

### Task 8: People API

**Files:**
- Create: `apps/api/src/routes/people.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- `GET /api/people` → people + `activeAssetCount` per person (compute via domain ledger)
- `POST /api/people` `{ name, note? }`
- `GET /api/people/:id`
- `PATCH /api/people/:id`
- `DELETE /api/people/:id` (CASCADE)
- All require session middleware

- [ ] **Step 1: Implement routes using UUIDs (`crypto.randomUUID()`) and ISO timestamps**
- [ ] **Step 2: Reject empty name with 400 `ValidationError` code**
- [ ] **Step 3: Manual curl CRUD smoke**
- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "feat(api): people CRUD with active asset counts"
```

---

### Task 9: Assets + transactions API

**Files:**
- Create: `apps/api/src/routes/assets.ts`, `apps/api/src/routes/transactions.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- `POST /api/people/:personId/assets` `{ kind: "balance", label } | { kind: "item", name }`
- `GET /api/people/:personId/assets?filter=active|settled|all`
- `GET /api/assets/:id` → asset + computed state + transactions
- `DELETE /api/assets/:id`
- `POST /api/assets/:id/transactions` balance `{ type, amount, date, note? }` or item `{ type, date, note? }`
- `PATCH /api/transactions/:id`
- `DELETE /api/transactions/:id`
- Server recomputes qty/status via `@pat/domain` before accepting returns/transitions

- [ ] **Step 1: Implement create balance + deposit; assert GET shows quantity**
- [ ] **Step 2: Attempt over-return → 400 `over_return`**
- [ ] **Step 3: Item received/returned happy path + illegal transition → 400**
- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "feat(api): assets and transactions with domain validation"
```

---

### Task 10: Export / import API

**Files:**
- Create: `apps/api/src/routes/backup.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- `GET /api/backup/export` → `ExportDoc` JSON download
- `POST /api/backup/import` body `ExportDoc` → replace-all in a single batch of SQL deletes/inserts; on `parseExportDoc` failure leave DB unchanged and return 400

- [ ] **Step 1: Seed data, export, wipe via import empty valid doc, re-import snapshot — verify counts**
- [ ] **Step 2: Import `{ schemaVersion: 2 }` → 400, data unchanged**
- [ ] **Step 3: Commit**

```bash
git add apps/api
git commit -m "feat(api): JSON export and replace-all import"
```

---

### Task 11: Web app scaffold + design tokens + font

**Files:**
- Create: `apps/web/*` Vite React TS app, `src/styles/tokens.css`, router shell
- Modify: root `package.json` scripts `dev:web`, `dev:api`

**Interfaces:**
- Produces: RTL root layout, CSS variables for notebook tokens, React Router routes placeholders

- [ ] **Step 1: Scaffold Vite React TS in `apps/web`; add `react-router`**
- [ ] **Step 2: Font decision — install `vazirmatn` (or `@fontsource/vazirmatn`) unless user objected; set `html { dir: rtl; font-family: Vazirmatn, Tahoma, sans-serif; }`**
- [ ] **Step 3: Add tokens**

```css
:root {
  --page: #f4efe6;
  --ink: #3d3428;
  --muted: #6a5f50;
  --rule: #cbbfad;
  --accent: #0f6b6b;
  --danger: #8b3a2f;
}
body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
}
```

- [ ] **Step 4: Placeholder routes for `/login`, `/`, `/people/:id`, `/assets/:id`, `/people/:id/settled`, `/settings`**
- [ ] **Step 5: Add `src/dates/jalali.ts` + Vitest: today → Gregorian `YYYY-MM-DD`; format known Gregorian → expected Jalali string; no visual design-system dependency**
- [ ] **Step 6: Commit**

```bash
git add apps/web package.json package-lock.json
git commit -m "feat(web): scaffold RTL PWA shell with notebook tokens and Jalali helpers"
```

---

### Task 12: API client + auth screens

**Files:**
- Create: `apps/web/src/api/client.ts`, `apps/web/src/routes/Login.tsx`, `apps/web/src/auth/AuthGate.tsx`
- Modify: `apps/web/src/App.tsx`, Vite proxy to API

**Interfaces:**
- `api.status()`, `api.setup(password)`, `api.login(password)`, `api.logout()` with `credentials: "include"`

- [ ] **Step 1: Proxy `/api` to wrangler in `vite.config.ts`**
- [ ] **Step 2: Login/setup UI (password field + submit); Persian copy**
- [ ] **Step 3: AuthGate redirects unauthenticated users to `/login`**
- [ ] **Step 4: Manual: setup → land on home placeholder**
- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): auth setup/login gate against API"
```

---

### Task 13: Offline cache + outbox

**Files:**
- Create: `apps/web/src/sync/cache.ts`, `apps/web/src/sync/outbox.ts`, `apps/web/src/sync/flush.ts`, `apps/web/src/sync/SyncContext.tsx`, `packages/domain/tests` N/A — add `apps/web` vitest tests for outbox ordering if pure functions extracted
- Prefer pure helpers in `apps/web/src/sync/outbox.ts`: `enqueue`, `peekAll`, `removeHead`

**Interfaces:**
- Snapshot key `pat:snapshot` stores `{ people, assets, transactions, updatedAt }`
- Outbox key `pat:outbox` stores ordered `{ id, method, path, body }[]`
- `flushOutbox`: FIFO; on first failure stop; on 401 stop and force login without dropping queue

- [ ] **Step 1: Write unit tests for enqueue order and removeHead**
- [ ] **Step 2: Implement idb-backed cache/outbox**
- [ ] **Step 3: SyncProvider exposes `{ online, pendingCount, refresh, mutate }`**
- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): IndexedDB snapshot cache and offline outbox"
```

---

### Task 14: Home screen

**Files:**
- Create: `apps/web/src/routes/Home.tsx`, `apps/web/src/components/SyncBanner.tsx`, `apps/web/src/components/PersonRow.tsx`
- Modify: router

**Interfaces:**
- Lists people with `personShortStatus(activeCount)`
- Header title «امانت‌ها» + settings gear
- Subtle «+ افزودن شخص»
- SyncBanner when `!online || pendingCount > 0`

- [ ] **Step 1: Implement UI per UI spec §4.2**
- [ ] **Step 2: Empty state copy when no people**
- [ ] **Step 3: Manual RTL check in browser**
- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): answer-first home people list"
```

---

### Task 15: Person screen + add asset flows

**Files:**
- Create: `apps/web/src/routes/Person.tsx`, `apps/web/src/components/AssetRow.tsx`, add dialogs/forms for new balance/item
- Modify: router

**Interfaces:**
- Sections موجودی‌ها / قلم‌ها with per-section add
- Active filter only
- Link to settled

- [ ] **Step 1: Implement layout + navigation to asset**
- [ ] **Step 2: Add balance (label) and item (name) forms — minimal fields**
- [ ] **Step 3: Manual create + appear in section**
- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): person screen with balance/item sections"
```

---

### Task 16: Asset screen + transactions

**Files:**
- Create: `apps/web/src/routes/Asset.tsx`, transaction form components
- Modify: router

**Interfaces:**
- Hero current state; واریز/برگشت or item actions; history list; edit on tap; delete with confirm

- [ ] **Step 1: Balance deposit/return forms — `JalaliDateField` defaulting to today; submit Gregorian `YYYY-MM-DD` to API; optional note**
- [ ] **Step 2: History rows format dates with `formatJalali`**
- [ ] **Step 3: Show domain/API error for over-return in one Persian line**
- [ ] **Step 4: Item received/returned actions (same date field)**
- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): asset history and Jalali capture actions"
```

---

### Task 17: Settled screen

**Files:**
- Create: `apps/web/src/routes/Settled.tsx`

- [ ] **Step 1: List settled assets for person; tap → Asset**
- [ ] **Step 2: Empty copy if none**
- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat(web): settled assets list"
```

---

### Task 18: Settings — password, export, import

**Files:**
- Create: `apps/web/src/routes/Settings.tsx`
- Modify: sync refresh after import

- [ ] **Step 1: Change password form**
- [ ] **Step 2: Export downloads `pat-export-YYYYMMDD.json`**
- [ ] **Step 3: Import file picker + strong confirm → POST import → full cache refresh**
- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): settings password and backup import/export"
```

---

### Task 19: PWA + Pages deploy wiring

**Files:**
- Modify: `apps/web/vite.config.ts` (`vite-plugin-pwa`), `apps/api/wrangler.toml`, root README deploy section
- Create: `apps/web/public/icon-192.png` (simple notebook mark — or SVG later)

- [ ] **Step 1: Enable generateSW; app installable on phone**
- [ ] **Step 2: Document: create D1, set `SESSION_SECRET`, `wrangler secret`, deploy API, deploy Pages with `/api` routed to Worker**
- [ ] **Step 3: README: local `npm run dev:api` + `npm run dev:web`**
- [ ] **Step 4: Commit**

```bash
git add apps/web apps/api README.md
git commit -m "chore: PWA manifest and Cloudflare deploy docs"
```

---

### Task 20: End-to-end smoke (manual checklist)

**Files:**
- Modify: `README.md` with checklist

- [ ] **Step 1: Run checklist locally**
  - Setup password
  - Add person علی
  - Add USDT + deposit 200 + return 50 → shows 150
  - Add دریل received → نزد من
  - Full return USDT → disappears from active; appears under تسویه‌شده‌ها
  - Export → import replace-all round-trip
  - Toggle offline in DevTools → banner; enqueue return; online flush
- [ ] **Step 2: Commit README checklist results note (pass)**

```bash
git add README.md
git commit -m "docs: add local smoke checklist for custody tracker"
```

---

## Self-review (plan vs specs)

| Spec requirement | Task(s) |
|---|---|
| PWA + Workers + D1 | 6, 11, 19 |
| Password/PIN session | 7, 12 |
| Person / Balance / Item / Tx model | 1–3, 8–9 |
| No adjust; edit/delete | 9, 16 |
| Over-return + item transitions | 3, 9, 16 |
| Settled hidden + link | 2, 15, 17 |
| Export/import replace-all | 4, 10, 18 |
| Offline cache + outbox LWW | 13 |
| Answer-first home, no activity feed | 14 |
| Person sections + per-section add | 15 |
| Asset history-first | 16 |
| Settings gear | 14, 18 |
| Calm notebook + teal accent | 11 |
| Vazirmatn decision point | 11 Step 2 |
| No third-party visual design system | 11, Global Constraints |
| Jalali UI / Gregorian storage | 11 Step 5, 16 |
| Domain tests | 2–5 |
| Cascade delete | 6 migration + 8–9 |

**Placeholder scan:** none intentional.  
**Type consistency:** `ExportDoc.schemaVersion: 1`, asset `kind: "balance" | "item"`, tx types match specs.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-personal-asset-custody-tracker.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — execute tasks in this session with executing-plans and checkpoints  

Which approach?
