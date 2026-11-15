import "../../ui/src/theme.css";
import "../src/styles.css";
import { createElement } from "react";
import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    a11y: { test: "error" },
    controls: { expanded: true },
  },
  decorators: [(Story) => createElement("div", { style: { padding: "2rem", minHeight: "100vh" } }, createElement(Story))],
};

export default preview;
