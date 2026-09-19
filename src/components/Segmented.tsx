import { ReactNode } from "react";

interface Option {
  value: string;
  label: string;
}

export default function Segmented({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      className="inline-flex rounded-[var(--radius-control)] p-0.5"
      style={{ background: "var(--surface-2)" }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-[calc(var(--radius-control) - 2px)] transition-all ${
              size === "sm" ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]"
            }`}
            style={
              active
                ? {
                    background: "var(--surface)",
                    border: "1px solid var(--hairline)",
                    boxShadow: "0 1px 3px rgba(0,0,0,.08)",
                    color: "var(--accent)",
                    fontWeight: 600,
                  }
                : { color: "var(--text-secondary)", border: "1px solid transparent" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative h-[22px] w-[40px] rounded-full transition-colors"
      style={{ background: on ? "var(--accent)" : "var(--surface-hover)" }}
      role="switch"
      aria-checked={on}
    >
      <span
        className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
        style={{ left: on ? 20 : 2 }}
      />
    </button>
  );
}

export function CardSection({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="surface-card mb-5 overflow-hidden">
      <div className="px-4 py-3 text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </div>
      <div style={{ borderTop: "1px solid var(--hairline)" }}>{children}</div>
    </div>
  );
}

export function SettingRow({
  icon,
  label,
  desc,
  children,
}: {
  icon?: ReactNode;
  label: ReactNode;
  desc?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3.5"
      style={{ borderTop: "1px solid var(--hairline)" }}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-[14px]" style={{ color: "var(--text-primary)" }}>
            {label}
          </div>
          {desc && <div className="caption mt-0.5">{desc}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
