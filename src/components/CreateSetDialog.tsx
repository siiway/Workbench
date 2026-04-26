import { useState, useEffect } from "react";
import {
  Button,
  Input,
  Field,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@fluentui/react-components";
import { useI18n } from "../i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
};

export function CreateSetDialog({ open, onClose, onCreate }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate(name.trim());
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
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t.createSetTitle}</DialogTitle>
          <DialogContent>
            <Field label={t.fieldName}>
              <Input
                value={name}
                onChange={(_, d) => setName(d.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                autoFocus
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">{t.cancel}</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              onClick={() => void submit()}
              disabled={!name.trim() || busy}
            >
              {t.create}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
