import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { SESSION_COOKIE_NAME, verifySession } from "../auth";
import type { Bindings } from "../env";

export const requireAuth = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (!token) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const payload = await verifySession(token, c.env.SESSION_SECRET);
    if (!payload) {
      return c.json({ error: "unauthorized" }, 401);
    }

    await next();
  },
);
