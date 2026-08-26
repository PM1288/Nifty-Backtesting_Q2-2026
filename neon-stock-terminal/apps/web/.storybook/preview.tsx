import type { Preview } from "@storybook/react";
import "../src/styles/global.css";

const preview: Preview = {
  parameters: {
    a11y: { test: "error" },
    controls: { expanded: true },
  },
  decorators: [
    (Story) => <div data-ui-compact-v5="true" style={{ minHeight: "100vh", padding: 8, background: "var(--bg-canvas)" }}><Story /></div>,
  ],
};

export default preview;
