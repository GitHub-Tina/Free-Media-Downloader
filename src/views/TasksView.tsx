import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import TaskRow from "../components/TaskRow";
import { useStore } from "../lib/engine";
import { t } from "../i18n";

type Tab = "all" | "running" | "done" | "error";

export default function TasksView() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c = { all: store.tasks.length, running: 0, done: 0, error: 0 };
    for (const x of store.tasks) {
      if (x.status === "running" || x.status === "queued" || x.status === "paused") c.running += 1;
      else if (x.status === "done" || x.status === "cancelled") c.done += 1;
      else if (x.status === "error") c.error += 1;
    }
    return c;
  }, [store.tasks]);

  const filtered = useMemo(() => {
    return store.tasks.filter((x) => {
      let ok = true;
      if (tab === "running") ok = x.status === "running" || x.status === "queued" || x.status === "paused";
      else if (tab === "done") ok = x.status === "done" || x.status === "cancelled";
      else if (tab === "error") ok = x.status === "error";
      if (ok && q) {
        const needle = q.toLowerCase();
        ok =
          x.name.toLowerCase().includes(needle) ||
          x.url.toLowerCase().includes(needle);
      }
      return ok;
    });
  }, [store.tasks, tab, q]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: t().tabAll, count: counts.all },
    { key: "running", label: t().tabRunning, count: counts.running },
    { key: "done", label: t().tabDone, count: counts.done },
    { key: "error", label: t().tabError, count: counts.error },
  ];

  return (
    <div className="h-full overflow-y-auto px-10 py-7">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold leading-tight">{t().tasksTitle}</h1>
        <div
          className="field flex h-9 w-[300px] items-center gap-2 px-3"
          style={{ borderRadius: "var(--radius-control)" }}
        >
          <Search size={15} color="var(--text-tertiary)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t().searchPlaceholder}
            className="h-full flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
      </div>

      {/* 四 Tab 下划线式 */}
      <div
        className="mt-4 flex gap-7"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        {tabs.map(({ key, label, count }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="relative pb-2.5 text-[14px] transition-colors"
              style={{
                color: active ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {label} · {count}
              {active && (
                <span
                  className="absolute inset-x-0 -bottom-[1px] h-[3px] rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 pb-4">
        {filtered.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
        {filtered.length === 0 && (
          <div className="caption py-16 text-center">{t().emptyDesc}</div>
        )}
      </div>
    </div>
  );
}
