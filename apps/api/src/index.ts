import { Hono } from "hono";
import type { Bindings } from "./env";
import auth from "./routes/auth";
import balances, { personBalances } from "./routes/balances";
import people from "./routes/people";
import transactions from "./routes/transactions";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", auth);
people.route("/:personId/balances", personBalances);
app.route("/api/people", people);
app.route("/api/balances", balances);
app.route("/api/transactions", transactions);

export default app;
export type { Bindings } from "./env";
