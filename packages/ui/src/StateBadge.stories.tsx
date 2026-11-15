import type { Meta, StoryObj } from "@storybook/react-vite";
import { StateBadge } from "./index.js";

const meta = {
  title: "Axiom/State Badge",
  component: StateBadge,
  args: { state: "enforce", children: "Permitted" },
  argTypes: {
    state: {
      control: "select",
      options: ["enforce", "observe", "pending", "deny", "revoked"],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof StateBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enforce: Story = {};
export const Observe: Story = { args: { state: "observe", children: "Shadow decision" } };
export const Pending: Story = { args: { state: "pending", children: "Awaiting approval" } };
export const Deny: Story = { args: { state: "deny", children: "Blocked" } };
export const Revoked: Story = { args: { state: "revoked", children: "Session revoked" } };
