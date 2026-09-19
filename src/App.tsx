import { useEffect, useMemo, useState } from "react";
import { platform } from "@tauri-apps/plugin-os";
import Titlebar from "./components/Titlebar";
import Sidebar, { type Route } from "./components/Sidebar";
import DownloadView from "./views/DownloadView";
import ExtractView from "./views/ExtractView";
import TasksView from "./views/TasksView";
import SettingsView from "./views/SettingsView";
import Onboarding from "./views/Onboarding";
import UpdateModal from "./views/UpdateModal";
import { initEngineListener, useStore } from "./lib/engine";
import { invoke } from "@tauri-apps/api/core";
import { t } from "./i18n";

const pageNames: Record<Route, () => string> = {
  download: () => t().navDownload,
  extract: () => t().navExtract,
  tasks: () => t().navTasks,
  settings: () => t().navSettings,
};

export default function App() {
  const [route, setRoute] = useState<Route>("download");
  const theme = useStore((s) => s.theme);
  const setOutDir = useStore((s) => s.setOutDir);
  const [onboarding, setOnboarding] = useState(
    !localStorage.getItem("md.onboarded"),
  );
  const [showUpdate, setShowUpdate] = useState(false);

  // 平台标记(win/mac)→ 设计令牌四组合(main.tsx 已按 UA 预设,此处用 os 插件结果校对)
  useEffect(() => {
    try {
      const p = platform();
      if (p === "macos" || p === "windows") {
        document.documentElement.dataset.platform =
          p === "macos" ? "mac" : "win";
      }
    } catch {
      // 保留 main.tsx 的 UA 判定
    }
  }, []);

  // 主题:浅/深/跟随系统
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const mode =
        theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.mode = mode;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // 引擎事件 + 默认下载目录 + 授权检查 + 启动检查更新
  useEffect(() => {
    initEngineListener();
    invoke<string>("get_default_out_dir")
      .then((d) => {
        if (!localStorage.getItem("md.outDir")) setOutDir(d);
      })
      .catch(() => {});
    const timer = setTimeout(() => {
      if (
        localStorage.getItem("md.checkUpdate") !== "false" &&
        !localStorage.getItem("md.updateIgnored")
      ) {
        setShowUpdate(true);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // 队列泵:任务变化时尝试补位(并发数以内)
  const tasks = useStore((s) => s.tasks);
  const pump = useStore((s) => s.pump);
  useEffect(() => {
    const running = tasks.filter((x) => x.status === "running").length;
    const queued = tasks.filter((x) => x.status === "queued").length;
    if (queued > 0 && running < useStore.getState().maxParallel) {
      pump();
    }
  }, [tasks, pump]);

  const pageName = useMemo(() => pageNames[route](), [route, route]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Titlebar pageName={pageName} />
      <div className="flex min-h-0 flex-1">
        <Sidebar route={route} onRoute={setRoute} />
        <main className="min-w-0 flex-1" style={{ background: "var(--bg)" }}>
          {route === "download" && <DownloadView go={setRoute} />}
          {route === "extract" && <ExtractView go={setRoute} />}
          {route === "tasks" && <TasksView />}
          {route === "settings" && <SettingsView />}
        </main>
      </div>
      {onboarding && (
        <Onboarding
          onDone={() => {
            localStorage.setItem("md.onboarded", "1");
            setOnboarding(false);
          }}
        />
      )}
      {showUpdate && <UpdateModal onClose={() => setShowUpdate(false)} />}
    </div>
  );
}
