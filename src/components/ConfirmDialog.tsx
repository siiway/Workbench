import {
  Button,
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
  title?: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title ?? t.confirm}</DialogTitle>
          <DialogContent>{message}</DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">{t.cancel}</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              style={
                destructive
                  ? { backgroundColor: "var(--colorPaletteRedBackground3, #c50f1f)" }
                  : undefined
              }
              onClick={onConfirm}
            >
              {confirmLabel ?? t.confirm}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
