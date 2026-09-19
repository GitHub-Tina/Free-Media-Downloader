import { useState } from "react";
import { Globe, CircleCheck, Film, Music, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { extractUrl } from "../lib/recognize";
import { useStore } from "../lib/engine";
import { t } from "../i18n";

interface MediaItem {
  kind: string;
  label: string;
  url: string;
  size: string;
  recommended: boolean;
}

export default function ExtractView({ go }: { go: (r: "download") => void }) {
  const store = useStore();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const doExtract = async () => {
    const target = extractUrl(url);
    if (!/^https?:\/\//i.test(target)) return;
    setLoading(true);
    setError("");
    setItems([]);
    try {
      const [title, list] = await invoke<[string, MediaItem[]]>("extract_media", {
        pageUrl: target,
      });
      setPageTitle(title);
      setItems(list);
      setSelected(new Set(list.filter((x) => x.recommended).map((x) => x.url)));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (u: string, exclusive: boolean) => {
    setSelected((prev) => {
      const next = exclusive ? new Set<string>([u]) : new Set(prev);
      if (exclusive) return next;
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  };

  const downloadSelected = () => {
    const chosen = items.filter((x) => selected.has(x.url));
    chosen.forEach((m) => {
      store.addTask({
        name: m.label + (m.kind === "audio" ? ".mp3" : ".mp4"),
        url: m.url,
        platform: "generic",
        format: "best",
        kind: m.kind === "audio" ? "audio" : "video",
      });
    });
    go("download");
  };

  return (
    <div className="h-full overflow-y-auto px-10 py-7">
      <h1 className="text-[28px] font-bold leading-tight">{t().extractTitle}</h1>
      <p className="mt-1 text-[14px]" style={{ color: "var(--text-tertiary)" }}>
        {t().extractSubtitle}
      </p>

      <div className="mt-5 flex gap-2.5">
        <div
          className="field flex flex-1 items-center gap-2.5 px-3.5"
          style={{ borderRadius: "var(--radius-control)" }}
        >
          <Globe size={16} color="var(--text-tertiary)" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doExtract()}
            placeholder="https://example.com/video/123"
            className="h-10 flex-1 bg-transparent text-[14px] outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
        <button
          className="btn-primary flex h-10 min-w-[88px] items-center justify-center gap-2 px-4 text-[14px]"
          disabled={loading || !extractUrl(url).startsWith("http")}
          onClick={doExtract}
        >
          {loading && <Loader2 size={15} className="animate-spin" />}
          {loading ? t().extracting : t().extractBtn}
        </button>
      </div>

      {error && (
        <div className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-4 flex items-center gap-2 text-[13px]">
            <CircleCheck size={16} color="var(--success)" />
            <span style={{ color: "var(--text-secondary)" }}>
              {t().foundN(items.length, pageTitle)}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-2.5">
            {items.map((m) => {
              const active = selected.has(m.url);
              return (
                <button
                  key={m.url}
                  onClick={(e) => toggle(m.url, !e.shiftKey && !selected.has(m.url))}
                  className="flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors"
                  style={{
                    background: active ? "var(--accent-soft)" : "var(--surface)",
                    border: `1px solid ${active ? "var(--accent)" : "var(--hairline)"}`,
                    borderRadius: "var(--radius-card)",
                  }}
                >
                  <span
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                    style={{
                      border: `1.5px solid ${active ? "var(--accent)" : "var(--text-tertiary)"}`,
                    }}
                  >
                    {active && <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />}
                  </span>
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--hairline)" }}
                  >
                    {m.kind === "audio" ? (
                      <Music size={17} color="var(--accent)" />
                    ) : (
                      <Film size={17} color="var(--text-secondary)" />
                    )}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14px] font-medium">{m.label}</span>
                    <span className="caption mt-0.5 block">{m.size}</span>
                  </span>
                  {m.recommended && (
                    <span
                      className="mr-1 flex items-center gap-1 text-[12px]"
                      style={{ color: "var(--accent)" }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                      {t().recommended}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex justify-end gap-2.5">
            <button
              className="btn-ghost px-4 py-2 text-[13px]"
              onClick={() => setSelected(new Set(items.map((x) => x.url)))}
            >
              {t().selectAll}
            </button>
            <button
              className="btn-primary px-4 py-2 text-[13px]"
              disabled={selected.size === 0}
              onClick={downloadSelected}
            >
              {t().downloadSelected(selected.size)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
