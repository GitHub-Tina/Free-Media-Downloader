import { useState } from "react";
import { Folder, Layers, Wifi, Palette, Languages, Power, RefreshCw, Globe2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import Segmented, { CardSection, SettingRow, Toggle } from "../components/Segmented";
import { useStore } from "../lib/engine";
import { getLang, setLang, t } from "../i18n";

export default function SettingsView() {
  const store = useStore();
  const [lang, setLangState] = useState(getLang());
  const [autostartOn, setAutostartOn] = useState(false);
  const [checkBoot, setCheckBoot] = useState(
    localStorage.getItem("md.checkUpdate") !== "false",
  );
  const [updateMsg, setUpdateMsg] = useState("");

  const browse = async () => {
    const picked = await open({ directory: true });
    if (typeof picked === "string") store.setOutDir(picked);
  };

  const toggleAutostart = async (v: boolean) => {
    try {
      if (v) await enable();
      else await disable();
      setAutostartOn(v);
    } catch {
      setAutostartOn(await isEnabled().catch(() => false));
    }
  };

  return (
    <div className="h-full overflow-y-auto px-10 py-7">
      <h1 className="text-[28px] font-bold leading-tight">{t().settingsTitle}</h1>

      <div className="mt-5 max-w-[860px]">
        {/* 下载 */}
        <CardSection title={t().grpDownload}>
          <SettingRow
            icon={<Folder size={18} color="var(--text-secondary)" />}
            label={t().defaultDir}
          >
            <span className="max-w-[320px] truncate text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              {store.outDir}
            </span>
            <button className="btn-ghost px-3.5 py-1.5 text-[13px]" onClick={browse}>
              {t().browse}
            </button>
          </SettingRow>
          <SettingRow
            icon={<Layers size={18} color="var(--text-secondary)" />}
            label={t().parallel}
          >
            <Segmented
              size="sm"
              options={[1, 2, 3, 5].map((n) => ({ value: String(n), label: String(n) }))}
              value={String(store.maxParallel)}
              onChange={(v) => store.setMaxParallel(Number(v))}
            />
          </SettingRow>
        </CardSection>

        {/* 网络 */}
        <CardSection title={t().grpNetwork}>
          <SettingRow
            icon={<Wifi size={18} color="var(--text-secondary)" />}
            label={t().netMode}
            desc={t().netSmartDesc}
          >
            <Segmented
              options={[
                { value: "smart", label: t().netSmart },
                { value: "direct", label: t().netDirect },
                { value: "system", label: t().netSystem },
              ]}
              value={store.netMode}
              onChange={(v) => store.setNetMode(v as typeof store.netMode)}
            />
          </SettingRow>
        </CardSection>

        {/* 外观 */}
        <CardSection title={t().grpAppearance}>
          <SettingRow
            icon={<Palette size={18} color="var(--text-secondary)" />}
            label={t().theme}
          >
            <Segmented
              options={[
                { value: "light", label: t().themeLight },
                { value: "dark", label: t().themeDark },
                { value: "system", label: t().themeSystem },
              ]}
              value={store.theme}
              onChange={(v) => store.setTheme(v as typeof store.theme)}
            />
          </SettingRow>
        </CardSection>

        {/* 通用 */}
        <CardSection title={t().grpGeneral}>
          <SettingRow
            icon={<Languages size={18} color="var(--text-secondary)" />}
            label={t().language}
          >
            <Segmented
              options={[
                { value: "zh-CN", label: "简体中文" },
                { value: "en-US", label: "English" },
              ]}
              value={lang}
              onChange={(v) => {
                setLang(v as typeof lang);
                setLangState(v as typeof lang);
              }}
            />
          </SettingRow>
          <SettingRow
            icon={<Power size={18} color="var(--text-secondary)" />}
            label={t().autostart}
          >
            <Toggle on={autostartOn} onChange={toggleAutostart} />
          </SettingRow>
          <SettingRow
            icon={<RefreshCw size={18} color="var(--text-secondary)" />}
            label={t().checkUpdateOnBoot}
            desc={t().currentVersion("2.4.1")}
          >
            <Toggle
              on={checkBoot}
              onChange={(v) => {
                setCheckBoot(v);
                localStorage.setItem("md.checkUpdate", String(v));
              }}
            />
            <button
              className="btn-ghost px-3.5 py-1.5 text-[13px]"
              onClick={() => setUpdateMsg(t().alreadyLatest)}
            >
              {t().checkUpdate}
            </button>
          </SettingRow>
          {updateMsg && (
            <SettingRow icon={<Globe2 size={18} color="var(--success)" />} label={updateMsg}>
              <span />
            </SettingRow>
          )}
        </CardSection>
      </div>
      <p
        className="mx-auto mt-3 max-w-[860px] px-1 text-[12px] leading-relaxed"
        style={{ color: "var(--text-tertiary)" }}
      >
        本工具仅用于下载您拥有权利或已获授权的公开内容(例如您自己发布的作品),请遵守所在平台的服务条款与当地法律法规;本工具不会处理任何加密或受数字版权保护的内容。
      </p>
    </div>
  );
}
