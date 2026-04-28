import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Field,
  Tag,
  TagGroup,
  Textarea,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { AppCard } from "../types";
import { useI18n } from "../i18n";

const useStyles = makeStyles({
  surface: {
    maxWidth: "min(560px, 95vw)",
    width: "min(560px, 95vw)",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  tagsRow: {
    display: "flex",
    gap: "6px",
    alignItems: "stretch",
  },
  tagChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    marginTop: "6px",
  },
  hint: {
    fontSize: "11.5px",
    color: tokens.colorNeutralForeground3,
  },
});

export type AppCardDraft = {
  name: string;
  url: string;
  iconUrl: string;
  description: string;
  tags: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  initial: AppCard | null;
  onSubmit: (draft: AppCardDraft) => Promise<void>;
};

// TODO(prism-picker): add a tab switcher at the top of the dialog body so the
// user can choose between "Custom URL" (current form) and "Pick from Prism"
// (fetch GET /api/teams/:teamId/prism-apps, dropdown of team-related apps,
// auto-fill name/iconUrl/url; if no homepage, default url to redirect_uri's
// origin and let the user edit).

// TODO(short-link): add an optional "Short link" input. Empty → backend
// auto-generates a short ID; non-empty → used as slug, validated unique
// per team. URL pattern: /a/<slug>.

const EMPTY: AppCardDraft = {
  name: "",
  url: "",
  iconUrl: "",
  description: "",
  tags: [],
};

export function AppCardDialog({ open, onClose, initial, onSubmit }: Props) {
  const styles = useStyles();
  const { t } = useI18n();
  const [draft, setDraft] = useState<AppCardDraft>(EMPTY);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        name: initial.name,
        url: initial.url,
        iconUrl: initial.iconUrl ?? "",
        description: initial.description ?? "",
        tags: [...initial.tags],
      });
    } else {
      setDraft(EMPTY);
    }
    setTagInput("");
  }, [open, initial]);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (
      draft.tags.some((existing) => existing.toLowerCase() === t.toLowerCase())
    ) {
      setTagInput("");
      return;
    }
    setDraft((d) => ({ ...d, tags: [...d.tags, t] }));
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== tag) }));
  };

  const submit = async () => {
    if (!draft.name.trim() || !draft.url.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({
        name: draft.name.trim(),
        url: draft.url.trim(),
        iconUrl: draft.iconUrl.trim(),
        description: draft.description.trim(),
        tags: draft.tags,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) onClose();
      }}
    >
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            {initial ? t.appsEditTitle : t.appsCreateTitle}
          </DialogTitle>
          <DialogContent>
            <div className={styles.body}>
              <Field label={t.appsFieldName} required>
                <Input
                  value={draft.name}
                  onChange={(_, d) => setDraft((p) => ({ ...p, name: d.value }))}
                  autoFocus
                />
              </Field>
              <Field label={t.appsFieldUrl} required>
                <Input
                  value={draft.url}
                  placeholder="https://..."
                  onChange={(_, d) => setDraft((p) => ({ ...p, url: d.value }))}
                />
              </Field>
              <Field label={t.appsFieldIconUrl}>
                <Input
                  value={draft.iconUrl}
                  placeholder="https://.../icon.png"
                  onChange={(_, d) =>
                    setDraft((p) => ({ ...p, iconUrl: d.value }))
                  }
                />
              </Field>
              <Field label={t.appsFieldDescription}>
                <Textarea
                  rows={2}
                  value={draft.description}
                  onChange={(_, d) =>
                    setDraft((p) => ({ ...p, description: d.value }))
                  }
                />
              </Field>
              <Field label={t.appsFieldTags}>
                <div className={styles.tagsRow}>
                  <Input
                    value={tagInput}
                    placeholder={t.appsFieldTagsPlaceholder}
                    onChange={(_, d) => setTagInput(d.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    appearance="secondary"
                    onClick={addTag}
                    disabled={!tagInput.trim()}
                  >
                    {t.appsAddTag}
                  </Button>
                </div>
                {draft.tags.length > 0 && (
                  <TagGroup
                    onDismiss={(_, d) => removeTag(d.value)}
                    className={styles.tagChips}
                  >
                    {draft.tags.map((tag) => (
                      <Tag
                        key={tag}
                        value={tag}
                        dismissible
                        appearance="brand"
                      >
                        {tag}
                      </Tag>
                    ))}
                  </TagGroup>
                )}
              </Field>
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">{t.cancel}</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              onClick={() => void submit()}
              disabled={!draft.name.trim() || !draft.url.trim() || busy}
            >
              {initial ? t.save : t.create}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
