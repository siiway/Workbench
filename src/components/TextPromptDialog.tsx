import { useEffect, useState } from "react";
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
  title: string;
  label?: string;
  initialValue?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void | Promise<void>;
};

export function TextPromptDialog({
  open,
  title,
  label,
  initialValue = "",
  confirmLabel,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setBusy(false);
    }
  }, [open, initialValue]);

  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await onConfirm(value.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <Field label={label}>
              <Input
                value={value}
                onChange={(_, d) => setValue(d.value)}
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
              disabled={!value.trim() || busy}
            >
              {confirmLabel ?? t.confirm}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
