// 任务 store + 引擎调度(并发限制 / 事件监听 / 引擎分派)
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isDirectMediaUrl } from "./recognize";
import { STORE_MODE } from "./storeMode";
import type { Platform } from "./recognize";

export type TaskStatus =
  | "queued"
  | "running"
  | "paused"
  | "done"
  | "error"
  | "cancelled";

export interface Task {
  id: string;
  name: string;
  url: string;
  platform: Platform;
  format: string; // best | 1080 | 720 | mp3
  kind: "video" | "audio";
  status: TaskStatus;
  downloaded: number;
  total: number;
  speed: number;
  percent: number;
  message: string;
  path: string;
  createdAt: number;
  avgSpeed: number;
  elapsed: number;
}

interface ProgressEvent {
  id: string;
  status: "running" | "done" | "error" | "cancelled";
  downloaded: number;
  total: number;
  speed: number;
  percent: number;
  message: string;
  path: string;
  name: string;
}

interface AppState {
  tasks: Task[];
  outDir: string;
  format: string;
  maxParallel: number;
  netMode: "smart" | "direct" | "system";
  theme: "light" | "dark" | "system";
  setOutDir: (d: string) => void;
  setFormat: (f: string) => void;
  setMaxParallel: (n: number) => void;
  setNetMode: (m: AppState["netMode"]) => void;
  setTheme: (t: AppState["theme"]) => void;
  addTask: (t: Omit<Task, "id" | "status" | "downloaded" | "total" | "speed" | "percent" | "message" | "path" | "createdAt" | "avgSpeed" | "elapsed">) => void;
  updateFromEvent: (e: ProgressEvent) => void;
  pauseTask: (id: string) => void;
  resumeTask: (id: string) => void;
  cancelTask: (id: string) => void;
  retryTask: (id: string) => void;
  removeTask: (id: string, deleteFile?: boolean) => void;
  pump: () => void;
}

let seq = 0;
function nextId() {
  seq += 1;
  return `t${Date.now()}_${seq}`;
}

function persistTasks(tasks: Task[]) {
  // 只保留最近 200 条
  localStorage.setItem("md.tasks", JSON.stringify(tasks.slice(0, 200)));
}
function loadTasks(): Task[] {
  try {
    const arr: Task[] = JSON.parse(localStorage.getItem("md.tasks") || "[]");
    // 上次会话遗留的 running/queued 任务其内核进程早已消亡(僵尸任务),
    // 若不处理会占满并发槽位,导致新任务永远排队不启动 —— 统一标记为已暂停
    const normalized = arr.map((t) =>
      t.status === "running" || t.status === "queued"
        ? { ...t, status: "paused" as TaskStatus, speed: 0 }
        : t,
    );
    if (normalized.some((t, i) => t !== arr[i])) {
      localStorage.setItem("md.tasks", JSON.stringify(normalized.slice(0, 200)));
    }
    return normalized;
  } catch {
    return [];
  }
}

export const useStore = create<AppState>((set, get) => ({
  tasks: loadTasks(),
  outDir: localStorage.getItem("md.outDir") || "",
  format: localStorage.getItem("md.format") || "best",
  maxParallel: Number(localStorage.getItem("md.maxParallel") || 3),
  netMode: (localStorage.getItem("md.netMode") as AppState["netMode"]) || "smart",
  theme: (localStorage.getItem("md.theme") as AppState["theme"]) || "system",

  setOutDir: (d) => {
    localStorage.setItem("md.outDir", d);
    set({ outDir: d });
  },
  setFormat: (f) => {
    localStorage.setItem("md.format", f);
    set({ format: f });
  },
  setMaxParallel: (n) => {
    localStorage.setItem("md.maxParallel", String(n));
    set({ maxParallel: n });
    get().pump();
  },
  setNetMode: (m) => {
    localStorage.setItem("md.netMode", m);
    set({ netMode: m });
  },
  setTheme: (t) => {
    localStorage.setItem("md.theme", t);
    set({ theme: t });
  },

  addTask: (t) => {
    const task: Task = {
      ...t,
      id: nextId(),
      status: "queued",
      downloaded: 0,
      total: 0,
      speed: 0,
      percent: 0,
      message: "",
      path: "",
      createdAt: Date.now(),
      avgSpeed: 0,
      elapsed: 0,
    };
    set({ tasks: [task, ...get().tasks] });
    persistTasks(get().tasks);
    get().pump();
  },

  updateFromEvent: (e) => {
    set({
      tasks: get().tasks.map((t) => {
        if (t.id !== e.id) return t;
        // 用户已本地置为 暂停/取消 的任务,忽略内核杀进程过程中的余波事件,
        // 否则 paused/cancelled 会被迟到的事件覆盖成别的状态导致按钮错乱
        if (t.status === "paused" || t.status === "cancelled") return t;
        const patch: Partial<Task> = { percent: e.percent, speed: e.speed };
        if (e.status === "running") {
          patch.status = "running";
          patch.downloaded = e.downloaded;
          patch.total = e.total;
          // yt-dlp 解析完成后内核会回传标题,替换难看的 URL 显示
          if (e.name && (t.name === t.url || !t.name)) patch.name = e.name;
        } else if (e.status === "done") {
          patch.status = "done";
          patch.percent = 100;
          patch.path = e.path || t.path;
          const secs = Math.max(0.5, (Date.now() - t.createdAt) / 1000);
          patch.elapsed = secs;
          if (e.total > 0) patch.avgSpeed = e.total / secs;
          if (!t.name || t.name === t.url) {
            const base = (e.path || "").split(/[\\/]/).pop();
            if (base) patch.name = base;
          }
        } else if (e.status === "error") {
          patch.status = "error";
          patch.message = e.message || "errGeneric";
        } else if (e.status === "cancelled") {
          patch.status = "cancelled";
        }
        return { ...t, ...patch };
      }),
    });
    persistTasks(get().tasks);
    if (e.status !== "running") get().pump();
  },

  pauseTask: (id) => {
    // v1:暂停 = 中止当前传输并标记,继续时重新下载
    invoke("abort_task", { id }).catch(() => {});
    set({
      tasks: get().tasks.map((t) =>
        t.id === id && (t.status === "running" || t.status === "queued")
          ? { ...t, status: "paused" }
          : t,
      ),
    });
    persistTasks(get().tasks);
    get().pump();
  },

  resumeTask: (id) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === id ? { ...t, status: "queued", speed: 0 } : t,
      ),
    });
    persistTasks(get().tasks);
    get().pump();
  },

  cancelTask: (id) => {
    invoke("abort_task", { id }).catch(() => {});
    set({
      tasks: get().tasks.map((t) =>
        t.id === id && (t.status === "running" || t.status === "queued")
          ? { ...t, status: "cancelled" }
          : t,
      ),
    });
    persistTasks(get().tasks);
    get().pump();
  },

  retryTask: (id) => {
    set({
      tasks: get().tasks.map((t) =>
        t.id === id ? { ...t, status: "queued", speed: 0, message: "" } : t,
      ),
    });
    persistTasks(get().tasks);
    get().pump();
  },

  removeTask: (id, deleteFile) => {
    const t = get().tasks.find((x) => x.id === id);
    if (t && (t.status === "running" || t.status === "queued")) {
      invoke("abort_task", { id }).catch(() => {});
    }
    if (deleteFile && t?.path) {
      invoke("delete_file", { path: t.path }).catch(() => {});
      invoke("delete_file", { path: t.path + ".part" }).catch(() => {});
    }
    set({ tasks: get().tasks.filter((x) => x.id !== id) });
    persistTasks(get().tasks);
    get().pump();
  },

  pump: () => {
    const { tasks, maxParallel, outDir, netMode } = get();
    const active = tasks.filter((t) => t.status === "running").length;
    let slots = maxParallel - active;
    if (slots <= 0) return;
    for (const t of tasks) {
      if (slots <= 0) break;
      if (t.status !== "queued") continue;
      slots -= 1;
      void launch(t, outDir, netMode);
    }
  },
}));

async function launch(
  task: Task,
  outDir: string,
  netMode: string,
) {
  // 标记 running
  useStore.setState({
    tasks: useStore.getState().tasks.map((x) =>
      x.id === task.id ? { ...x, status: "running" } : x,
    ),
  });

  try {
    if (task.platform === "douyin") {
      // 抖音:无水印解析 → HTTP 直链下载 → 可选转 MP3
      const info = await invoke<{ title: string; url: string }>("douyin_resolve", {
        shareText: task.url,
        // 商店版保留官方水印(合规裁剪);完整版去水印
        keepWatermark: STORE_MODE,
      });
      useStore.setState({
        tasks: useStore.getState().tasks.map((x) =>
          x.id === task.id ? { ...x, name: `${info.title}.mp4` } : x,
        ),
      });
      const dest = `${outDir.replace(/[\\/]+$/, "")}/${info.title}.mp4`;
      useStore.getState().updateFromEvent({
        id: task.id, status: "running", downloaded: 0, total: 0, speed: 0,
        percent: 0, message: "", path: "", name: "",
      });
      await invoke("http_download", {
        id: task.id,
        url: info.url,
        dest,
        referer: "https://www.douyin.com/",
      });
      // http_download 内部通过事件回报 done/error;转 MP3 在事件处理后再做?
      // v1 简化:等待事件 done 后由事件分支触发转换(见 initEngineListener)
      return;
    }

    if (isDirectMediaUrl(task.url) && task.platform === "generic") {
      const name = task.url.split(/[/?#]/).filter(Boolean).pop() || "media.mp4";
      const dest = `${outDir.replace(/[\\/]+$/, "")}/${name.split("?")[0]}`;
      await invoke("http_download", {
        id: task.id,
        url: task.url,
        dest,
        referer: null,
      });
      return;
    }

    // 主流站点:B站 / YouTube / 其他网页 → yt-dlp 后端
    await invoke("backend_download", {
      id: task.id,
      url: task.url,
      format: task.format,
      outDir,
      direct: netMode === "direct",
    });
  } catch (e) {
    useStore.getState().updateFromEvent({
      id: task.id,
      status: "error",
      downloaded: 0,
      total: 0,
      speed: 0,
      percent: 0,
      message: String(e),
      path: "",
      name: "",
    });
  }
}

// 抖音 MP3:done 事件后如果 format=mp3 且 path 以 .mp4 结尾 → convert_mp3
let inited = false;
export async function initEngineListener() {
  if (inited) return;
  inited = true;
  await listen<ProgressEvent>("task-progress", (ev) => {
    const e = ev.payload;
    const store = useStore.getState();
    const task = store.tasks.find((t) => t.id === e.id);
    store.updateFromEvent(e);
    if (
      e.status === "done" &&
      task &&
      task.platform === "douyin" &&
      task.format === "mp3" &&
      e.path.endsWith(".mp4")
    ) {
      invoke<string>("convert_mp3", { src: e.path })
        .then((mp3) => {
          useStore.getState().updateFromEvent({
            id: e.id, status: "done", downloaded: 0, total: 0, speed: 0,
            percent: 100, message: "", path: mp3, name: "",
          });
        })
        .catch((err) => {
          useStore.getState().updateFromEvent({
            id: e.id, status: "error", downloaded: 0, total: 0, speed: 0,
            percent: 0, message: String(err), path: "", name: "",
          });
        });
    }
  });
}
