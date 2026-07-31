import { Hono } from "hono";
import type { Bindings } from "./env";
import auth from "./routes/auth";
import people from "./routes/people";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", auth);
app.route("/api/people", people);

export default app;
export type { Bindings } from "./env";
