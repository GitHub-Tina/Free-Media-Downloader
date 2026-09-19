import { useState } from "react";
import { ClipboardPaste, ArrowRight, Film, Music, Download, Link2, FolderOpen, X } from "lucide-react";
import { t } from "../i18n";

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl px-6 py-5"
      style={{ background: "var(--surface-2)", border: "1px solid var(--hairline)", minWidth: 110 }}
    >
      {icon}
      <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
    </div>
  );
}

function Badge({ fg, bg, label }: { fg: string; bg: string; label: string }) {
  return (
    <span
      className="rounded-full px-3 py-1 text-[12px] font-medium"
      style={{ color: fg, background: bg }}
    >
      {label}
    </span>
  );
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [page, setPage] = useState(0);
  const allPages = [0, 1, 2];
  const pageIds = allPages; // 文案差异由 i18n 处理,三页结构两分支统一
  const pages = [
    {
      title: t().ob1Title,
      desc: t().ob1Desc,
      art: (
        <div className="flex items-center gap-4">
          <Chip icon={<Link2 size={26} color="var(--accent)" />} label="链接" />
          <ArrowRight size={18} color="var(--text-tertiary)" />
          <Chip icon={<Download size={26} color="var(--accent)" />} label={t().navDownload} />
          <ArrowRight size={18} color="var(--text-tertiary)" />
          <Chip icon={<FolderOpen size={26} color="var(--accent)" />} label="文件夹" />
        </div>
      ),
    },
    {
      title: t().ob2Title,
      desc: t().ob2Desc,
      art: (
        <div className="flex items-center gap-4">
          <div className="icon-gradient flex h-14 w-14 items-center justify-center rounded-xl">
            <Film size={26} color="#fff" />
          </div>
          <ArrowRight size={18} color="var(--text-tertiary)" />
          <div className="icon-gradient flex h-14 w-14 items-center justify-center rounded-xl">
            <Music size={26} color="#fff" />
          </div>
        </div>
      ),
    },
    {
      title: t().ob3Title,
      desc: t().ob3Desc,
      art: (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Badge fg="var(--accent)" bg="var(--accent-soft)" label={t().recDouyin} />
          <Badge fg="var(--badge-bilibili)" bg="color-mix(in srgb, var(--badge-bilibili) 10%, transparent)" label={t().recBilibili} />
          <Badge fg="var(--badge-youtube)" bg="color-mix(in srgb, var(--badge-youtube) 10%, transparent)" label={t().recYouTube} />
          <Badge fg="var(--text-secondary)" bg="var(--surface-2)" label={t().recGeneric} />
        </div>
      ),
    },
  ];
  const p = pages[pageIds[Math.min(page, pageIds.length - 1)]];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.45)" }}
    >
      <div
        className="relative flex h-[620px] w-[960px] flex-col items-center justify-center overflow-hidden rounded-xl"
        style={{ background: "var(--surface)" }}
      >
        <button
          className="absolute right-6 top-5 text-[13px] hover:underline"
          style={{ color: "var(--text-tertiary)" }}
          onClick={onDone}
        >
          {t().onboardingSkip}
        </button>
        <button
          className="absolute left-6 top-5 flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--surface-hover)]"
          style={{ color: "var(--text-tertiary)", visibility: page > 0 ? "visible" : "hidden" }}
          onClick={() => setPage((v) => v - 1)}
          aria-label={t().onboardingBack}
        >
          <X size={16} className="rotate-45" />
        </button>

        <div className="flex flex-col items-center px-16 text-center">
          <div className="icon-gradient flex h-16 w-16 items-center justify-center rounded-2xl">
            {page === 2 ? (
              <Link2 size={30} color="#fff" />
            ) : (
              <ClipboardPaste size={30} color="#fff" />
            )}
          </div>
          <h2 className="mt-6 text-[24px] font-bold">{p.title}</h2>
          <p className="mt-2 max-w-[520px] text-[14px]" style={{ color: "var(--text-secondary)" }}>
            {p.desc}
          </p>
          <div className="mt-10 flex h-24 items-center">{p.art}</div>
        </div>

        {/* 页尾:圆点进度 */}
        <div className="absolute bottom-10 flex items-center gap-2">
          {pageIds.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all"
              style={{
                width: i === page ? 18 : 8,
                height: 8,
                background: i === page ? "var(--accent)" : "var(--surface-hover)",
              }}
            />
          ))}
        </div>

        <div className="absolute bottom-24 flex gap-3">
          {page > 0 && (
            <button className="btn-ghost px-5 py-2 text-[14px]" onClick={() => setPage(page - 1)}>
              {t().onboardingBack}
            </button>
          )}
          {page < pageIds.length - 1 ? (
            <button className="btn-primary px-6 py-2 text-[14px]" onClick={() => setPage(page + 1)}>
              {t().onboardingNext}
            </button>
          ) : (
            <button className="btn-primary px-6 py-2 text-[14px]" onClick={onDone}>
              {t().onboardingStart}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
