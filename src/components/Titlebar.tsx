import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "../i18n";

interface Props {
  pageName: string;
}

export default function Titlebar({ pageName }: Props) {
  const win = getCurrentWindow();
  const isMac = document.documentElement.dataset.platform === "mac";

  if (isMac) {
    // macOS:交通灯由系统绘制(Overlay),标题居中
    return (
      <div
        data-tauri-drag-region
        className="relative flex h-12 shrink-0 items-center justify-center"
        style={{ background: "var(--bg-sidebar)" }}
      >
        <span data-tauri-drag-region className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {t().appName} · {pageName}
        </span>
      </div>
    );
  }

  // Windows:左侧图标+标题,右侧三控制钮(46×48 热区)
  return (
    <div
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center justify-between pl-4"
      style={{ background: "var(--bg-sidebar)" }}
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <img src="/app-icon.png" alt="" className="h-[22px] w-[22px] rounded-md" draggable={false} />
        <span data-tauri-drag-region className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {t().appName}
        </span>
        <span data-tauri-drag-region className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
          · {pageName}
        </span>
      </div>
      <div className="flex h-12">
        <button
          onClick={() => win.minimize()}
          className="flex h-12 w-[46px] items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
          style={{ color: "var(--text-secondary)" }}
          aria-label="minimize"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => win.toggleMaximize()}
          className="flex h-12 w-[46px] items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
          style={{ color: "var(--text-secondary)" }}
          aria-label="maximize"
        >
          <Square size={13} />
        </button>
        <button
          onClick={() => win.hide()}
          className="flex h-12 w-[46px] items-center justify-center transition-colors hover:bg-[#E81123] hover:text-white"
          style={{ color: "var(--text-secondary)" }}
          aria-label="close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
