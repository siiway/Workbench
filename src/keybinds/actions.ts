/**
 * Action registry — every keybindable thing lives here. v1 ships with the
 * five most common ones surfaced in Settings; the rest are TODO stubs that
 * register themselves but aren't editable yet.
 *
 * TODO(keybind-coverage): expand the action set as users ask. Ideas: focus
 *   search on current page, switch team to next/prev, open context menu of
 *   the focused list item, etc. Each new action just needs a row here +
 *   wiring its handler at the right component.
 */

export type ActionId =
  | "console.toggle"
  | "nav.overview"
  | "nav.tasks"
  | "nav.apps"
  | "nav.permissions";

export type ActionDef = {
  id: ActionId;
  /** Short label shown in the Settings list. */
  label: string;
  /** One-line description. */
  description: string;
  /** Default binding spec — see parse.ts for format. */
  defaultBinding: string;
};

export const ACTIONS: ActionDef[] = [
  {
    id: "console.toggle",
    label: "Toggle console",
    description: "Open / close the console drawer on any page.",
    defaultBinding: "Ctrl+`",
  },
  {
    id: "nav.overview",
    label: "Go to Overview",
    description: "Navigate to the team dashboard.",
    defaultBinding: "g o",
  },
  {
    id: "nav.tasks",
    label: "Go to Tasks",
    description: "Navigate to the Tasks page.",
    defaultBinding: "g t",
  },
  {
    id: "nav.apps",
    label: "Go to Apps",
    description: "Navigate to the Apps launcher.",
    defaultBinding: "g a",
  },
  {
    id: "nav.permissions",
    label: "Go to Permissions",
    description: "Navigate to the Permissions overview.",
    defaultBinding: "g p",
  },
];

export const ACTION_BY_ID: Record<ActionId, ActionDef> = ACTIONS.reduce(
  (acc, a) => {
    acc[a.id] = a;
    return acc;
  },
  {} as Record<ActionId, ActionDef>,
);
