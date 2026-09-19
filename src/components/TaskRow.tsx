import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Film, Music, AlertTriangle, X, Copy, Trash2, File, FolderOpen, RotateCw, Pause, Play } from "lucide-react";
import type { Task } from "../lib/engine";
import { useStore } from "../lib/engine";
import { fmtBytes, fmtSpeed, fmtRemaining, fmtWhen } from "../lib/format";
import { t } from "../i18n";

function IconBtn({
  icon: Icon,
  onClick,
  title,
  danger,
}: {
  icon: typeof File;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-control)] transition-colors hover:bg-[var(--surface-hover)]"
      style={{ color: danger ? "var(--danger)" : "var(--text-secondary)" }}
    >
      <Icon size={16} />
    </button>
  );
}

export default function TaskRow({ task }: { task: Task }) {
  const s = useStore();
  const [askDelete, setAskDelete] = useState(false);
  const askDeleteFile = task.status === "done" && !!task.path;
  const isAudio = task.name.toLowerCase().endsWith(".mp3") || task.format === "mp3";
  const failed = task.status === "error";
  const running = task.status === "running";
  const done = task.status === "done";
  const queued = task.status === "queued";
  const paused = task.status === "paused";
  const cancelled = task.status === "cancelled";
  const message =
    failed || task.message
      ? task.message === "errNeedLogin"
        ? t().errNeedLogin
        : task.message === "errNetwork"
          ? t().errNetwork
          : task.message === "errGeneric" || task.message === "下载失败"
            ? t().errGeneric
            : task.message === "errDouyin"
              ? t().errDouyin
              : task.message
      : "";

  return (
    <div
      className="surface-card flex items-center gap-4 px-4"
      style={{ minHeight: 64, marginTop: 10 }}
    >
      {/* 左:40×40 类型图标 */}
      {failed ? (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
          style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)" }}
        >
          <AlertTriangle size={20} color="var(--danger)" />
        </div>
      ) : (
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] ${
            done && isAudio ? "icon-gradient" : ""
          }`}
          style={
            done && isAudio
              ? undefined
              : { background: "var(--surface-2)", border: "1px solid var(--hairline)" }
          }
        >
          {isAudio ? (
            <Music size={20} color={done ? "#fff" : "var(--accent)"} />
          ) : (
            <Film size={20} color="var(--text-secondary)" />
          )}
        </div>
      )}

      {/* 中:文件名 + 元数据 + 进度 */}
      <div className="min-w-0 flex-1 py-2.5">
        <div className="flex items-baseline gap-2">
          <span
            className="truncate text-[14px] font-medium"
            style={{ color: failed ? "var(--danger)" : "var(--text-primary)" }}
          >
            {task.name}
          </span>
          {(done || paused) && (
            <span className="caption shrink-0">{fmtWhen(task.createdAt)}</span>
          )}
          {running && task.total > 0 && (
            <span className="caption shrink-0">
              {fmtBytes(task.downloaded)} / {fmtBytes(task.total)}
            </span>
          )}
          {queued && <span className="caption shrink-0">{t().waiting}</span>}
        </div>

        {running && (
          <>
            <div className="progress-track mt-1.5">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, task.percent)}%` }}
              />
            </div>
            <div className="caption mt-1 flex gap-3">
              {task.speed > 0 && <span>{fmtSpeed(task.speed)}</span>}
              {task.total > 0 && <span>{fmtRemaining(task.downloaded, task.total, task.speed)}</span>}
              {task.total > 0 ? (
                <span>{task.percent.toFixed(0)}%</span>
              ) : (
                // 无总量=内核还在解析链接/取格式,尚未开始传输
                <span>{t().resolving}</span>
              )}
            </div>
          </>
        )}
        {paused && <div className="caption mt-0.5">{t().pausedMsg}</div>}
        {done && task.avgSpeed > 0 && (
          <div className="caption mt-0.5">
            {t().avgInfo(fmtSpeed(task.avgSpeed), `${task.elapsed.toFixed(1)}s`)}
          </div>
        )}
        {failed && message && (
          <div className="mt-0.5 text-[13px]" style={{ color: "var(--danger)" }}>
            {message}
          </div>
        )}
      </div>

      {/* 右:操作区 */}
      <div className="flex shrink-0 items-center gap-1">
        {running && (
          <>
            <IconBtn icon={Pause} title={t().pause} onClick={() => s.pauseTask(task.id)} />
            <IconBtn icon={X} title={t().cancel} onClick={() => s.cancelTask(task.id)} />
          </>
        )}
        {queued && <IconBtn icon={X} title={t().cancel} onClick={() => s.cancelTask(task.id)} />}
        {paused && (
          <>
            <button
              className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-[13px]"
              onClick={() => s.resumeTask(task.id)}
            >
              <Play size={14} /> {t().resume}
            </button>
            <IconBtn icon={Trash2} title={t().remove} danger onClick={() => s.removeTask(task.id)} />
          </>
        )}
        {cancelled && (
          <>
            <button
              className="btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-[13px]"
              onClick={() => s.retryTask(task.id)}
            >
              <RotateCw size={14} /> {t().retry}
            </button>
            <IconBtn icon={Copy} title={t().copyLink} onClick={() => writeText(task.url)} />
            <IconBtn icon={Trash2} title={t().remove} danger onClick={() => s.removeTask(task.id)} />
          </>
        )}
        {failed && (
          <>
            <button
              className="btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-[13px]"
              onClick={() => s.retryTask(task.id)}
            >
              <RotateCw size={14} /> {t().retry}
            </button>
            <IconBtn icon={Copy} title={t().copyLink} onClick={() => writeText(task.url)} />
            <IconBtn icon={Trash2} title={t().remove} danger onClick={() => s.removeTask(task.id)} />
          </>
        )}
        {done && (
          <>
            {task.path ? (
              <>
                <button
                  className="btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-[13px]"
                  onClick={() =>
                    invoke("open_in_shell", { path: task.path, reveal: true }).catch(
                      (e) => console.error("reveal failed", e),
                    )
                  }
                >
                  <FolderOpen size={14} /> {t().openFolder}
                </button>
                <IconBtn
                  icon={File}
                  title={t().openFile}
                  onClick={() =>
                    invoke("open_in_shell", { path: task.path, reveal: false }).catch(
                      (e) => console.error("open failed", e),
                    )
                  }
                />
              </>
            ) : (
              // 旧版记录没有存路径,打开类操作无从执行,只保留复制/删除
              <span className="caption mr-1">(旧记录无路径)</span>
            )}
            <IconBtn
              icon={Copy}
              title={t().copyLink}
              onClick={() => writeText(task.url)}
            />
            <IconBtn
              icon={Trash2}
              title={t().remove}
              danger
              onClick={() => (askDeleteFile ? setAskDelete(true) : s.removeTask(task.id, false))}
            />
          </>
        )}
      </div>

      {/* 删除确认弹窗:询问是否同步删除本地文件 */}
      {askDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,.45)" }}
          onClick={() => setAskDelete(false)}
        >
          <div
            className="w-[460px] rounded-xl p-6"
            style={{ background: "var(--surface)", border: "1px solid var(--hairline)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)" }}
              >
                <Trash2 size={20} color="var(--danger)" />
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold">{t().delTitle}</div>
                <div className="mt-1 truncate text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  {task.name}
                </div>
              </div>
            </div>
            <div className="mt-4 text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {t().delBody}
            </div>
            <div className="mt-5 flex justify-end gap-2.5">
              <button className="btn-ghost px-3.5 py-2 text-[13px]" onClick={() => setAskDelete(false)}>
                {t().cancel}
              </button>
              <button
                className="btn-ghost px-3.5 py-2 text-[13px]"
                onClick={() => {
                  setAskDelete(false);
                  s.removeTask(task.id, false);
                }}
              >
                {t().delKeep}
              </button>
              <button
                className="flex items-center gap-1.5 rounded-[var(--radius-control)] px-3.5 py-2 text-[13px] font-semibold text-white"
                style={{ background: "var(--danger)" }}
                onClick={() => {
                  setAskDelete(false);
                  s.removeTask(task.id, true);
                }}
              >
                <Trash2 size={14} /> {t().delWithFile}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
