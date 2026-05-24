import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Bindings, Variables } from "./types";

import initRoutes from "./routes/init";
import authRoutes from "./routes/auth";
import glintRoutes from "./routes/glint";
import settingsRoutes from "./routes/settings";
import teamSettingsRoutes from "./routes/teamSettings";
import appsRoutes from "./routes/apps";
import keybindsRoutes from "./routes/keybinds";
import nextbridgeRoutes from "./routes/nextbridge";

export { NbHub } from "./durable/NbHub";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.onError((err, c) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error("Unhandled worker error:", message, stack);
  return c.json({ error: message, stack }, 500);
});

// Global body-size cap on every API endpoint. 64 KB covers the realistic
// envelope of every write today (apps with descriptions, settings JSON,
// chat send with the 4 KB text cap, keybinds, etc) while preventing a
// caller from forcing the Worker to buffer multi-MB payloads. The Glint
// proxy lives behind the same cap — todo / set / comment writes through
// Glint have never been close to this.
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) =>
      c.json({ error: "Request body too large (limit 64 KB)" }, 413),
  }),
);

app.route("/", initRoutes);
app.route("/", authRoutes);
app.route("/", glintRoutes);
app.route("/", settingsRoutes);
app.route("/", teamSettingsRoutes);
app.route("/", appsRoutes);
app.route("/", keybindsRoutes);
app.route("/", nextbridgeRoutes);

export default { fetch: app.fetch };
