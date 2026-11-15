import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModeBadge, VerdictBadge } from "./VerdictBadge.js";

const meta = {
  title: "Cedar Studio/Verdict Badge",
  component: VerdictBadge,
  args: { verdict: "ALLOW" },
  argTypes: {
    verdict: { control: "select", options: ["ALLOW", "WOULD_DENY", "DENY", null] },
    status: {
      control: "select",
      options: ["ok", "invalid", "timeout", "unavailable", "contract_mismatch", "error"],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof VerdictBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Allow: Story = {};
export const ObserveWouldDeny: Story = { args: { verdict: "WOULD_DENY" } };
export const EnforceDeny: Story = { args: { verdict: "DENY" } };
export const Timeout: Story = { args: { verdict: null, status: "timeout" } };
export const Mode: Story = {
  render: () => <ModeBadge mode="observe" />,
};
