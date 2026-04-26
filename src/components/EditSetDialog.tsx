import { useState, useEffect } from "react";
import {
  Button,
  Input,
  Field,
  Switch,
  Dropdown,
  Option,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  makeStyles,
} from "@fluentui/react-components";
import type { TodoSet } from "../types";
import { useI18n } from "../i18n";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  row: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
  },
});

type SetPatch = {
  name?: string;
  autoRenew?: boolean;
  renewTime?: string;
  timezone?: string;
  splitCompleted?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  set: TodoSet | null;
  onSave: (patch: SetPatch) => Promise<void>;
};

const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export function EditSetDialog({ open, onClose, set, onSave }: Props) {
  const styles = useStyles();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  const [renewTime, setRenewTime] = useState("00:00");
  const [timezone, setTimezone] = useState("");
  const [splitCompleted, setSplitCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (set && open) {
      setName(set.name);
      setAutoRenew(set.autoRenew);
      setRenewTime(set.renewTime || "00:00");
      setTimezone(set.timezone || "");
      setSplitCompleted(set.splitCompleted);
    }
  }, [set, open]);

  const submit = async () => {
    if (!set || busy) return;
    setBusy(true);
    const patch: SetPatch = {};
    if (name.trim() !== set.name) patch.name = name.trim();
    if (autoRenew !== set.autoRenew) patch.autoRenew = autoRenew;
    if (renewTime !== set.renewTime) patch.renewTime = renewTime;
    if (timezone !== set.timezone) patch.timezone = timezone;
    if (splitCompleted !== set.splitCompleted)
      patch.splitCompleted = splitCompleted;
    try {
      await onSave(patch);
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
          <DialogTitle>{t.editSetTitle}</DialogTitle>
          <DialogContent>
            <div className={styles.body}>
              <Field label={t.fieldName}>
                <Input
                  value={name}
                  onChange={(_, d) => setName(d.value)}
                />
              </Field>

              <Field label={t.fieldAutoRenew}>
                <Switch
                  checked={autoRenew}
                  onChange={(_, d) => setAutoRenew(d.checked)}
                />
              </Field>

              {autoRenew && (
                <div className={styles.row}>
                  <Field label={t.fieldRenewTime} style={{ flex: 1 }}>
                    <Input
                      type="time"
                      value={renewTime}
                      onChange={(_, d) => setRenewTime(d.value)}
                    />
                  </Field>
                  <Field label={t.fieldTimezone} style={{ flex: 2 }}>
                    <Dropdown
                      value={timezone || "UTC"}
                      selectedOptions={[timezone || "UTC"]}
                      onOptionSelect={(_, d) =>
                        setTimezone(d.optionValue ?? "")
                      }
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <Option key={tz} value={tz}>
                          {tz}
                        </Option>
                      ))}
                    </Dropdown>
                  </Field>
                </div>
              )}

              <Field label={t.fieldSplitCompleted}>
                <Switch
                  checked={splitCompleted}
                  onChange={(_, d) => setSplitCompleted(d.checked)}
                />
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
              disabled={!name.trim() || busy}
            >
              {t.save}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
