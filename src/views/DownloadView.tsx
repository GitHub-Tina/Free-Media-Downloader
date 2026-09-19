import { useEffect, useRef, useState } from "react";
import { Folder, X, ClipboardPaste, Film, Globe } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { invoke } from "@tauri-apps/api/core";
import Segmented from "../components/Segmented";
import TaskRow from "../components/TaskRow";
import { useStore } from "../lib/engine";
import { recognize, type Platform } from "../lib/recognize";
import { t } from "../i18n";
import { STORE_MODE } from "../lib/storeMode";

function Badge({ platform }: { platform: Platform }) {
  const map: Record<Platform, { label: string; fg: string; bg: string }> = {
    douyin: {
      label: STORE_MODE ? t().recGeneric.replace(/网页$/, "") || t().recGeneric : t().recDouyin,
      fg: "var(--accent)",
      bg: "var(--accent-soft)",
    },
    bilibili: {
      label: t().recBilibili,
      fg: "var(--badge-bilibili)",
      bg: "color-mix(in srgb, var(--badge-bilibili) 10%, transparent)",
    },
    youtube: {
      label: t().recYouTube,
      fg: "var(--badge-youtube)",
      bg: "color-mix(in srgb, var(--badge-youtube) 10%, transparent)",
    },
    generic: {
      label: t().recGeneric,
      fg: "var(--text-secondary)",
      bg: "var(--surface-2)",
    },
  };
  const s = map[platform];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{ color: s.fg, background: s.bg }}
    >
      {s.label}
    </span>
  );
}

export default function DownloadView({ go }: { go: (r: "tasks" | "extract") => void }) {
  const store = useStore();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [recTitle, setRecTitle] = useState("");
  const [recLoading, setRecLoading] = useState(false);
  const recSeq = useRef(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const rec = recognize(text);
  const platform = rec?.platform ?? null;

  // 识别变化:抖音异步取标题(<300ms 出徽标,标题随后填充)
  useEffect(() => {
    setRecTitle("");
    if (platform !== "douyin" || !rec) return;
    const seq = ++recSeq.current;
    setRecLoading(true);
    const timer = setTimeout(() => {
      invoke<{ title: string }>("douyin_resolve", { shareText: rec.url })
        .then((info) => {
          if (recSeq.current === seq) {
            setRecTitle(info.title.replace(/\s+/g, " ").trim());
            setRecLoading(false);
          }
        })
        .catch(() => {
          if (recSeq.current === seq) setRecLoading(false);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  const doPaste = async () => {
    try {
      const clip = await readText();
      if (clip) setText(clip);
    } catch {
      /* 剪贴板无文本 */
    }
  };

  const browse = async () => {
    const picked = await open({ directory: true });
    if (typeof picked === "string") store.setOutDir(picked);
  };

  const start = () => {
    if (!rec) return;
    store.addTask({
      name: recTitle || rec.url,
      url: rec.url,
      platform: rec.platform,
      format: store.format,
      kind: store.format === "mp3" ? "audio" : "video",
    });
    setText("");
    setRecTitle("");
  };

  const activeTasks = store.tasks.filter(
    (x) => x.status === "running" || x.status === "queued",
  );
  const recentDone = store.tasks.filter((x) => x.status === "done").slice(0, 2);
  const shown = [...activeTasks, ...recentDone].slice(0, 4);

  return (
    <div className="h-full overflow-y-auto px-10 py-7">
      <h1 className="text-[28px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
        {t().downloadTitle}
      </h1>
      <p className="mt-1 text-[14px]" style={{ color: "var(--text-tertiary)" }}>
        {STORE_MODE ? "下载视频与音频到本机 · 自动识别链接类型" : t().downloadSubtitle}
      </p>

      {/* 大输入框 */}
      <div
        className="relative mt-5"
        style={{ border: `1.5px solid ${focused || rec ? "var(--accent)" : "var(--hairline)"}`, borderRadius: "var(--radius-control)", background: "var(--surface)" }}
      >
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t().inputPlaceholder}
          className="w-full resize-none bg-transparent px-4 py-3 text-[14px] outline-none"
          style={{ minHeight: 120, color: "var(--text-primary)" }}
          onContextMenu={(e) => {
            e.preventDefault();
            void doPaste();
          }}
        />
        <div className="absolute bottom-2.5 right-3 flex items-center gap-2">
          {text && (
            <button
              className="btn-ghost flex items-center gap-1 px-2.5 py-1 text-[12px]"
              onClick={() => setText("")}
            >
              <X size={12} /> 清除
            </button>
          )}
          <button
            className="btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-[12px]"
            onClick={doPaste}
          >
            <ClipboardPaste size={13} /> {t().paste}
          </button>
        </div>
      </div>

      {/* 识别结果卡 */}
      {rec && (
        <div
          className="surface-card mt-3 flex items-center gap-3 px-3 py-2.5"
          style={{ borderColor: focused ? "var(--accent)" : "var(--hairline)" }}
        >
          <div className="icon-gradient flex h-[52px] w-[88px] shrink-0 items-center justify-center rounded-md">
            {platform === "douyin" || platform === "bilibili" || platform === "youtube" ? (
              <Film size={22} color="#fff" />
            ) : (
              <Globe size={22} color="#fff" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge platform={platform!} />
              {recLoading && (
                <span className="caption animate-pulse">识别中…</span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {recTitle || rec.url}
            </div>
          </div>
          <button
            className="btn-ghost flex h-7 w-7 items-center justify-center"
            onClick={() => setText("")}
            aria-label="clear"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 下载内容 + 路径 + CTA */}
      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {t().qualityLabel}
          </span>
          <Segmented
            options={[
              { value: "best", label: t().qBest },
              { value: "1080", label: t().q1080 },
              { value: "720", label: t().q720 },
              { value: "mp3", label: t().qMp3 },
            ]}
            value={store.format}
            onChange={store.setFormat}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          <Folder size={16} />
          <span className="truncate">{t().saveTo}</span>
          <span className="truncate" style={{ color: "var(--text-tertiary)" }}>
            {store.outDir}
          </span>
        </div>
        <button className="btn-ghost px-3.5 py-1.5 text-[13px]" onClick={browse}>
          {t().browse}
        </button>
      </div>

      <button
        disabled={!rec}
        onClick={start}
        className="cta-gradient mt-4 h-12 w-full rounded-[var(--radius-control)] text-[15px] font-semibold text-white shadow-[0_6px_16px_rgba(85,88,232,0.25)] transition-opacity disabled:opacity-40"
      >
        {t().startDownload}
      </button>

      {/* 底部下载列表 */}
      <div className="mt-7">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold">{t().navTasks}</span>
          <button
            className="text-[13px] hover:underline"
            style={{ color: "var(--accent)" }}
            onClick={() => go("tasks")}
          >
            {t().viewAll}
          </button>
        </div>
        {shown.length === 0 ? (
          <div
            className="surface-card mt-2.5 flex flex-col items-center justify-center py-10"
            style={{ borderStyle: "dashed", borderWidth: 1.5 }}
          >
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full"
              style={{ background: "var(--accent-soft)" }}
            >
              <ClipboardPaste size={36} color="var(--accent)" />
            </div>
            <div className="mt-3 text-[15px] font-medium">{t().emptyTitle}</div>
            <div className="caption mt-1">{t().emptyDesc}</div>
          </div>
        ) : (
          shown.map((task) => <TaskRow key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
