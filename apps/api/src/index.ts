import { Hono } from "hono";
import type { Bindings } from "./env";
import auth from "./routes/auth";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", auth);

export default app;
export type { Bindings } from "./env";
