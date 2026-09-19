import { Download, Link2, History, Settings } from "lucide-react";
import { t } from "../i18n";

export type Route = "download" | "extract" | "tasks" | "settings";

const items: { key: Route; icon: typeof Download; label: () => string }[] = [
  { key: "download", icon: Download, label: () => t().navDownload },
  { key: "extract", icon: Link2, label: () => t().navExtract },
  { key: "tasks", icon: History, label: () => t().navTasks },
  { key: "settings", icon: Settings, label: () => t().navSettings },
];

export default function Sidebar({
  route,
  onRoute,
}: {
  route: Route;
  onRoute: (r: Route) => void;
}) {
  return (
    <div
      className="flex w-[220px] shrink-0 flex-col justify-between py-4"
      style={{ background: "var(--bg-sidebar)", borderRight: "1px solid var(--hairline)" }}
    >
      <nav className="flex flex-col gap-1 px-3">
        {items.map(({ key, icon: Icon, label }) => {
          const active = route === key;
          return (
            <button
              key={key}
              onClick={() => onRoute(key)}
              className={`nav-item flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left text-[14px] ${
                active ? "active" : ""
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              {label()}
            </button>
          );
        })}
      </nav>
      <div className="px-4 caption select-none">v2.4.1</div>
    </div>
  );
}
