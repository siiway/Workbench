/**
 * Drop-in replacement for <Input type="password"> with a show/hide eye toggle.
 * Passes through all InputProps except `type`. Toggle is excluded from tab order.
 */

import { useState, forwardRef } from "react";
import type { ComponentProps } from "react";
import { Input, Button, Tooltip, makeStyles } from "@fluentui/react-components";
import { EyeRegular, EyeOffRegular } from "@fluentui/react-icons";
import { useI18n } from "../i18n";

const useStyles = makeStyles({
  toggle: {
    // Exclude from tab order — keyboard users jump between form fields
  },
});

type InputProps = ComponentProps<typeof Input>;

type Props = Omit<InputProps, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput(props, ref) {
    const { t } = useI18n();
    const styles = useStyles();
    const [visible, setVisible] = useState(false);

    const toggle = (
      <Tooltip
        content={visible ? t.hidePassword : t.showPassword}
        relationship="label"
      >
        <Button
          appearance="transparent"
          size="small"
          icon={visible ? <EyeOffRegular /> : <EyeRegular />}
          tabIndex={-1}
          className={styles.toggle}
          onClick={(e) => {
            e.preventDefault();
            setVisible((v) => !v);
          }}
          aria-label={visible ? t.hidePassword : t.showPassword}
        />
      </Tooltip>
    );

    return (
      <Input
        ref={ref}
        {...props}
        type={visible ? "text" : "password"}
        contentAfter={toggle}
      />
    );
  },
);
