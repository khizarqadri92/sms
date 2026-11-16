import { useState, useEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { dashboardsApi } from "../../api/dashboardsApi";
import { Tooltip } from "recharts";
import "./Dashboard.css";

/**
 * Chart colours that follow the app's light/dark mode. Recharts draws SVG
 * attributes, where CSS variables don't work reliably, so the real colours
 * are picked here and the charts re-render when the mode changes.
 */
export function useChartTheme() {
  const read = () => document.documentElement.getAttribute("data-color-mode") === "dark";
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-mode"] });
    return () => obs.disconnect();
  }, []);
  return dark ? {
    dark: true, text: "#cbd5e1", muted: "#94a3b8", grid: "#334155", surface: "#1e293b", border: "#475569",
    pass: "#4ade80", comp: "#fbbf24", fail: "#f87171", main: "#60a5fa", prev: "#64748b",
    series: ["#60a5fa", "#4ade80", "#fbbf24", "#f472b6", "#a78bfa", "#22d3ee", "#fb923c", "#a3e635", "#e879f9", "#38bdf8", "#facc15", "#34d399"],
  } : {
    dark: false, text: "#334155", muted: "#64748b", grid: "#e2e8f0", surface: "#ffffff", border: "#e2e8f0",
    pass: "#16a34a", comp: "#d97706", fail: "#dc2626", main: "#2563eb", prev: "#cbd5e1",
    series: ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#ea580c", "#65a30d", "#c026d3", "#0284c7", "#ca8a04", "#059669"],
  };
}

/** Common axis props for the current theme. */
export const axis = (t) => ({ stroke: t.grid, tick: { fill: t.muted, fontSize: 11 }, tickLine: false });

/** Themed tooltip. */
export function ThemedTooltip({ t, suffix = "", ...rest }) {
  return (
    <Tooltip
      {...rest}
      contentStyle={{ background: t.surface, border: "1px solid " + t.border, borderRadius: 8, fontSize: 12, color: t.text }}
      labelStyle={{ color: t.text, fontWeight: 700 }}
      itemStyle={{ color: t.text }}
      cursor={{ fill: t.dark ? "rgba(148,163,184,.08)" : "rgba(15,23,42,.04)" }}
      formatter={(v, name) => [v == null ? "-" : v + suffix, name]}
    />
  );
}

export function ChartCard({ title, subtitle, children, action, span = 1, height = 260 }) {
  return (
    <div className={"dk-card" + (span === 2 ? " dk-span2" : "")}>
      <div className="dk-card-head">
        <div>
          <div className="dk-card-title">{title}</div>
          {subtitle && <div className="dk-card-sub">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className="dk-chart" style={{ height }}>{children}</div>
    </div>
  );
}

export function StatTile({ label, value, sub, tone = "", onClick }) {
  return (
    <div className={"dk-tile" + (tone ? " dk-tile--" + tone : "") + (onClick ? " dk-tile--link" : "")} onClick={onClick}>
      <div className="dk-tile-label">{label}</div>
      <div className="dk-tile-value">{value ?? "-"}</div>
      {sub && <div className="dk-tile-sub">{sub}</div>}
    </div>
  );
}

export function EmptyChart({ text }) {
  return <div className="dk-empty">{text}</div>;
}

export function DashHeader({ title, sub, onRefresh, loading }) {
  return (
    <div className="dk-head">
      <div>
        <div className="dk-title">{title}</div>
        {sub && <div className="dk-sub">{sub}</div>}
      </div>
      {onRefresh && <button className="dk-refresh" onClick={onRefresh} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>}
    </div>
  );
}

export const fmtDay = (iso) => { const d = new Date(iso + "T00:00:00"); return d.getDate() + " " + d.toLocaleString("en-US", { month: "short" }); };


// ---------------------------------------------------------------- hero banner

let _meCache = null;
/** Who the user is (name, role, designation/department, class, campus, school) - fetched once per session. */
export function useMe() {
  const { user } = useAuth();
  const [me, setMe] = useState(_meCache);
  useEffect(() => {
    if (_meCache) return;
    dashboardsApi.me().then(r => { _meCache = r.data.data; setMe(_meCache); }).catch(() => {});
  }, []);
  return { ...(me || {}), name: (me && me.name) || user?.name || "" };
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

/**
 * Top banner for every role dashboard.
 *   alert:      { text, tone: "bad" | "warn" | "ok", onClick }   - the single most important thing right now
 *   highlights: [{ label, value, sub, onClick }]                  - up to 3 role-specific key figures
 */
export function HeroBanner({ alert, highlights = [], onRefresh, loading, today, context }) {
  const me = useMe();
  const who = [me.designation || me.role_label, me.department && me.department !== me.designation ? me.department + " department" : null,
               me.class, me.children != null ? me.children + (me.children === 1 ? " child" : " children") + " enrolled" : null,
               context].filter(Boolean);
  const where = [me.campus, me.school].filter(Boolean).join(" · ");
  const first = (me.name || "").split(" ")[0];
  return (
    <div className="dk-hero">
      <div className="dk-hero-top">
        <div className="dk-hero-id">
          <div className="dk-hero-avatar">{(me.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}</div>
          <div>
            <div className="dk-hero-greet">{greeting()}{first ? ", " + first : ""}</div>
            <div className="dk-hero-who">{who.join(" · ")}</div>
            {where && <div className="dk-hero-where">{where}{today ? " · " + new Date(today + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : ""}</div>}
          </div>
        </div>
        {onRefresh && <button className="dk-hero-refresh" onClick={onRefresh} disabled={loading}>{loading ? "Loading..." : "\u21bb Refresh"}</button>}
      </div>
      {alert && (
        <div className={"dk-hero-alert dk-hero-alert--" + (alert.tone || "ok") + (alert.onClick ? " dk-hero-click" : "")} onClick={alert.onClick}>
          <span className="dk-hero-alert-icon">{alert.tone === "bad" ? "\u26a0" : alert.tone === "warn" ? "\u23f3" : "\u2714"}</span>
          <span>{alert.text}</span>
          {alert.onClick && <span className="dk-hero-go">&rarr;</span>}
        </div>
      )}
      {highlights.length > 0 && (
        <div className="dk-hero-hl">
          {highlights.filter(Boolean).slice(0, 3).map(h => (
            <div key={h.label} className={"dk-hero-chip" + (h.onClick ? " dk-hero-click" : "")} onClick={h.onClick}>
              <div className="dk-hero-chip-v">{h.value ?? "-"}</div>
              <div className="dk-hero-chip-l">{h.label}</div>
              {h.sub && <div className="dk-hero-chip-s">{h.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
