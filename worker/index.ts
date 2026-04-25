import { Hono } from "hono";
import type { Bindings, Variables } from "./types";

import initRoutes from "./routes/init";
import authRoutes from "./routes/auth";
import glintRoutes from "./routes/glint";
import settingsRoutes from "./routes/settings";
import teamSettingsRoutes from "./routes/teamSettings";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.onError((err, c) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error("Unhandled worker error:", message, stack);
  return c.json({ error: message, stack }, 500);
});

app.route("/", initRoutes);
app.route("/", authRoutes);
app.route("/", glintRoutes);
app.route("/", settingsRoutes);
app.route("/", teamSettingsRoutes);

export default { fetch: app.fetch };
