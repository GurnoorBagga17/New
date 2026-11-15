import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Icon({
  children,
  width = 16,
  height = 16,
  style,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={width}
      height={height}
      style={{
        maxWidth: typeof width === "number" ? `${width}px` : width,
        maxHeight: typeof height === "number" ? `${height}px` : height,
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8.5 6.2 11.7 13 4.9" />
    </Icon>
  );
}

export function DenyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 1.8 13 3.6v4.1c0 3.1-2.1 5.2-5 6.5-2.9-1.3-5-3.4-5-6.5V3.6L8 1.8Z" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.8 8S4.2 3.8 8 3.8 14.2 8 14.2 8 11.8 12.2 8 12.2 1.8 8 1.8 8Z" />
      <circle cx="8" cy="8" r="2" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.2 14.4 13.2H1.6L8 2.2Z" />
      <path d="M8 6.3v3.1M8 11.5v.1" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 4.6V8l2.3 1.4" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.8 4.3h10.4M6.2 4.3V2.8h3.6v1.5M4.2 4.3l.6 9h6.4l.6-9" />
    </Icon>
  );
}

export function BeakerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.8 1.8h4.4M6.6 1.8v4.1L3.2 12.4c-.4.7.1 1.8 1 1.8h7.6c.9 0 1.4-1.1 1-1.8L9.4 5.9V1.8" />
      <path d="M4.6 9.6h6.8" />
    </Icon>
  );
}
