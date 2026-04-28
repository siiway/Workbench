/**
 * Keybinds settings tab — lists each user-facing action with its current
 * binding. Click "Change" to record a new combo (next key combo captured),
 * or "Reset" to restore the default.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Body2,
  Button,
  Caption1,
  Subtitle2,
  Divider,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ACTIONS, type ActionDef } from "../keybinds/actions";
import { useKeybinds } from "../keybinds/KeybindProvider";
import { comboFromEvent } from "../keybinds/parse";

const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    maxWidth: "720px",
    paddingTop: tokens.spacingVerticalL,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 0",
  },
  rowMeta: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  bindingDisplay: {
    fontFamily:
      "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    fontSize: "12.5px",
    padding: "2px 8px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "4px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  recording: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  hint: {
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
    marginTop: "8px",
  },
});

export function KeybindsSettings() {
  const styles = useStyles();
  const { bindings, setBinding, resetBinding } = useKeybinds();
  const [recording, setRecording] = useState<string | null>(null);
  const recorderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (recording) recorderRef.current?.focus();
  }, [recording]);

  const onRecord = (
    actionId: string,
    e: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setRecording(null);
      return;
    }
    // Allow plain-key sequences too: typing a plain letter records it as the
    // first step of a sequence — but the recorder UI is one-shot for now.
    // For sequences (e.g. "g o"), use the text input directly via "Manual" link.
    const spec = comboFromEvent(e.nativeEvent);
    if (!spec) return;
    e.preventDefault();
    void setBinding(actionId as never, spec);
    setRecording(null);
  };

  return (
    <div className={styles.body}>
      <div className={styles.section}>
        <Subtitle2>Keyboard shortcuts</Subtitle2>
        <Divider />
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          Combo bindings (e.g. <code>Ctrl+`</code>) work everywhere; sequence
          bindings (e.g. <code>g o</code>) only fire outside text inputs.
          Sequences must be edited manually below — the recorder only captures
          single combos.
        </Caption1>
        {ACTIONS.map((a) => (
          <KeybindRow
            key={a.id}
            def={a}
            current={bindings[a.id] ?? a.defaultBinding}
            isRecording={recording === a.id}
            onStartRecord={() => setRecording(a.id)}
            onStopRecord={() => setRecording(null)}
            onRecord={(e) => onRecord(a.id, e)}
            onManualSet={(spec) => void setBinding(a.id, spec)}
            onReset={() => void resetBinding(a.id)}
          />
        ))}
        <Caption1 className={styles.hint}>
          Press Esc while recording to cancel. Default values are restored on
          Reset.
        </Caption1>
      </div>
    </div>
  );
}

function KeybindRow({
  def,
  current,
  isRecording,
  onStartRecord,
  onStopRecord,
  onRecord,
  onManualSet,
  onReset,
}: {
  def: ActionDef;
  current: string;
  isRecording: boolean;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onRecord: (e: KeyboardEvent<HTMLInputElement>) => void;
  onManualSet: (spec: string) => void;
  onReset: () => void;
}) {
  const styles = useStyles();
  const [manualValue, setManualValue] = useState(current);
  const [editingManual, setEditingManual] = useState(false);

  return (
    <div className={styles.row}>
      <div className={styles.rowMeta}>
        <Body2 style={{ fontWeight: 600 }}>{def.label}</Body2>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          {def.description}
        </Caption1>
      </div>
      {isRecording ? (
        <input
          autoFocus
          readOnly
          className={[styles.bindingDisplay, styles.recording].join(" ")}
          value="press a combo…"
          onKeyDown={onRecord}
          onBlur={onStopRecord}
          style={{ outline: "none", minWidth: "140px", textAlign: "center" }}
        />
      ) : editingManual ? (
        <input
          className={styles.bindingDisplay}
          value={manualValue}
          autoFocus
          onChange={(e) => setManualValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onManualSet(manualValue.trim() || def.defaultBinding);
              setEditingManual(false);
            } else if (e.key === "Escape") {
              setEditingManual(false);
              setManualValue(current);
            }
          }}
          onBlur={() => setEditingManual(false)}
          style={{ outline: "none", minWidth: "140px" }}
        />
      ) : (
        <span className={styles.bindingDisplay}>{current}</span>
      )}
      <Button size="small" appearance="subtle" onClick={onStartRecord}>
        Record
      </Button>
      <Button
        size="small"
        appearance="subtle"
        onClick={() => {
          setManualValue(current);
          setEditingManual(true);
        }}
      >
        Manual
      </Button>
      <Button
        size="small"
        appearance="subtle"
        onClick={() => {
          onReset();
          setManualValue(def.defaultBinding);
        }}
      >
        Reset
      </Button>
    </div>
  );
}
