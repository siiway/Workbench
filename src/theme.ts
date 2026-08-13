import type { Theme } from "@fluentui/react-components";

const LIGHT = {
  colorNeutralBackground1: "#ffffff",
  colorNeutralBackground2: "#ffffff",
  colorNeutralBackground3: "#f5f5f5",
  colorNeutralBackground1Hover: "#f0f0f0",
  colorNeutralBackground1Pressed: "#ebebeb",
  colorNeutralBackground1Selected: "#ebebeb",
  colorNeutralBackground2Hover: "#f0f0f0",
  colorNeutralBackground2Pressed: "#ebebeb",
  colorNeutralBackground2Selected: "#ebebeb",
  colorNeutralBackground3Hover: "#e8e8e8",
  colorNeutralBackground3Pressed: "#e0e0e0",
  colorNeutralBackground3Selected: "#e0e0e0",
  colorNeutralStroke1: "#d1d1d1",
  colorNeutralStroke2: "#d0d0d0",
  colorNeutralStroke3: "#e0e0e0",
};

const DARK = {
  colorNeutralBackground1: "#000000",
  colorNeutralBackground2: "#0a0a0a",
  colorNeutralBackground3: "#141414",
  colorNeutralBackground1Hover: "#1a1a1a",
  colorNeutralBackground1Pressed: "#222222",
  colorNeutralBackground1Selected: "#222222",
  colorNeutralBackground2Hover: "#1a1a1a",
  colorNeutralBackground2Pressed: "#222222",
  colorNeutralBackground2Selected: "#222222",
  colorNeutralBackground3Hover: "#222222",
  colorNeutralBackground3Pressed: "#2a2a2a",
  colorNeutralBackground3Selected: "#2a2a2a",
  colorNeutralStroke1: "#333333",
  colorNeutralStroke2: "#2a2a2a",
  colorNeutralStroke3: "#222222",
};

const SHARED = {
  shadow2: "none",
  shadow4: "none",
  shadow8: "none",
  shadow16: "none",
  shadow28: "none",
  shadow64: "none",
  shadow2Brand: "none",
  shadow4Brand: "none",
  shadow8Brand: "none",
  shadow16Brand: "none",
  shadow28Brand: "none",
  shadow64Brand: "none",
  borderRadiusLarge: "10px",
  borderRadiusXLarge: "12px",
  borderRadius2XLarge: "14px",
};

export function patchTheme(theme: Theme, dark: boolean): Theme {
  return { ...theme, ...SHARED, ...(dark ? DARK : LIGHT) } as Theme;
}
