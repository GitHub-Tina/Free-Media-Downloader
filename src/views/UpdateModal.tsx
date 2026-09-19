import { useState } from "react";
import { Download } from "lucide-react";
import { t } from "../i18n";

export default function UpdateModal({ onClose }: { onClose: () => void }) {
  const [dontRemind, setDontRemind] = useState(false);
  const [updating, setUpdating] = useState(false);

  const update = () => {
    setUpdating(true);
    setTimeout(() => {
      localStorage.setItem("md.updateIgnored", "true");
      onClose();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.45)" }}
    >
      <div
        className="w-[560px] rounded-xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--hairline)" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: "var(--accent-soft)" }}
          >
            <Download size={22} color="var(--accent)" />
          </div>
          <div>
            <div className="text-[16px] font-semibold">{t().updateTitle} v2.5.0</div>
            <div className="caption mt-0.5">{t().updateSize}</div>
          </div>
        </div>

        <div className="my-4" style={{ borderTop: "1px solid var(--hairline)" }} />

        <ul className="flex flex-col gap-1.5">
          {t().updateNotes.map((n, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
              {n}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            <input
              type="checkbox"
              checked={dontRemind}
              onChange={(e) => setDontRemind(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            {t().dontRemind}
          </label>
          <div className="flex gap-2.5">
            <button
              className="btn-ghost px-4 py-2 text-[13px]"
              onClick={() => {
                if (dontRemind) localStorage.setItem("md.updateIgnored", "true");
                onClose();
              }}
            >
              {t().later}
            </button>
            <button className="btn-primary px-4 py-2 text-[13px]" onClick={update} disabled={updating}>
              {updating ? "…" : t().updateNow}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
