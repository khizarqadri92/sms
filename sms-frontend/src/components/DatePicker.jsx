import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import { useProcessingToday } from "../hooks/useProcessingToday";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEKDAY_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const POPUP_WIDTH = 272;
const POPUP_HEIGHT_ESTIMATE = 360;

export default function DatePicker({ value, onChange, disabled, min, max, style, placeholder }) {
  const { formatDate, settings } = useRegionalSettings();
  const processingToday = useProcessingToday();
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? new Date(value) : new Date()));
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  useEffect(() => { if (!value) setViewDate(new Date(processingToday)); }, [processingToday]);
  const wrapperRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      const inWrapper = wrapperRef.current && wrapperRef.current.contains(e.target);
      const inPopup = popupRef.current && popupRef.current.contains(e.target);
      if (!inWrapper && !inPopup) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) setViewDate(d);
    }
  }, [value]);

  // Position the portaled popup against the input's live screen position,
  // flipping above the input (or clamping horizontally) if it would
  // otherwise run off the viewport - this keeps it fully visible even
  // inside a scrollable modal, unlike a plain absolute-positioned popup
  // which gets clipped by the modal's own overflow.
  const updateCoords = () => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + POPUP_HEIGHT_ESTIMATE > window.innerHeight) {
      top = Math.max(8, rect.top - POPUP_HEIGHT_ESTIMATE - 4);
    }
    if (left + POPUP_WIDTH > window.innerWidth) {
      left = Math.max(8, window.innerWidth - POPUP_WIDTH - 8);
    }
    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
    const handler = () => updateCoords();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const firstDayIndex = Math.max(0, WEEKDAY_NAMES.indexOf(settings?.first_day_of_week || "Monday"));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const numDays = new Date(year, month + 1, 0).getDate();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() - firstDayIndex + 7) % 7;

  const weeks = [];
  let day = 1 - startOffset;
  while (day <= numDays) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(day >= 1 && day <= numDays ? day : null);
      day++;
    }
    weeks.push(week);
  }

  const selectDate = (d) => {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onChange(iso);
    setOpen(false);
  };

  const isDisabledDay = (d) => {
    if (!d) return true;
    const dateObj = new Date(year, month, d);
    if (min && dateObj < new Date(min)) return true;
    if (max && dateObj > new Date(max)) return true;
    return false;
  };

  const weekdayLabels = [...Array(7)].map((_, i) => WEEKDAY_SHORT[(firstDayIndex + i) % 7]);

  const selectedDateObj = value ? new Date(value) : null;

  const minYear = min ? new Date(min).getFullYear() : year - 100;
  const maxYear = max ? new Date(max).getFullYear() : year + 20;
  const yearLo = Math.min(minYear, year);
  const yearHi = Math.max(maxYear, year);
  const yearOptions = [];
  for (let y = yearHi; y >= yearLo; y--) yearOptions.push(y);

  const popup = open ? (
    <div ref={popupRef} style={{
      position: "fixed", zIndex: 99999, top: coords.top, left: coords.left, background: "#fff",
      border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", width: POPUP_WIDTH,
      overflow: "hidden",
    }}>
      {/* Header: theme-colored, shows the currently selected date in the configured format */}
      <div style={{
        background: "var(--theme-primary, #2563eb)", color: "#fff", padding: "14px 16px 16px",
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, opacity: 0.85, textTransform: "uppercase" }}>
          Select date
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, lineHeight: 1.2 }}>
          {formatDate(selectedDateObj || processingToday)}
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 4 }}>
          <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "2px 6px", flexShrink: 0, color: "#475569" }}>
            &#8249;
          </button>
          <select
            value={month}
            onChange={(e) => setViewDate(new Date(year, Number(e.target.value), 1))}
            style={{ fontWeight: 600, fontSize: 12, border: "none", borderRadius: 6, padding: "3px 2px", background: "transparent", cursor: "pointer", flex: 1, minWidth: 0, color: "#0f172a" }}
          >
            {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={(e) => setViewDate(new Date(Number(e.target.value), month, 1))}
            style={{ fontWeight: 600, fontSize: 12, border: "none", borderRadius: 6, padding: "3px 2px", background: "transparent", cursor: "pointer", width: 68, flexShrink: 0, color: "#0f172a" }}
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "2px 6px", flexShrink: 0, color: "#475569" }}>
            &#8250;
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
          {weekdayLabels.map((w, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textAlign: "center" }}>{w}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {week.map((d, di) => {
              const disabledDay = isDisabledDay(d);
              const selected = selectedDateObj && d &&
                selectedDateObj.getFullYear() === year && selectedDateObj.getMonth() === month && selectedDateObj.getDate() === d;
              return (
                <button key={di} type="button" disabled={!d || disabledDay}
                  onClick={() => d && !disabledDay && selectDate(d)}
                  style={{
                    padding: "7px 0", fontSize: 12, border: "none", borderRadius: "50%",
                    cursor: d && !disabledDay ? "pointer" : "default",
                    background: selected ? "var(--theme-primary, #2563eb)" : "transparent",
                    color: !d ? "transparent" : disabledDay ? "#cbd5e1" : selected ? "#fff" : "#0f172a",
                    fontWeight: selected ? 700 : 400,
                  }}>
                  {d || ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "inline-block", ...style }}>
      <input
        type="text"
        readOnly
        disabled={disabled}
        className="form-input"
        style={{ width: "100%", fontSize: 13, cursor: disabled ? "default" : "pointer", background: disabled ? "#f1f5f9" : "#fff" }}
        value={value ? formatDate(value) : ""}
        placeholder={placeholder || "Select date"}
        onClick={() => !disabled && setOpen((o) => !o)}
      />
      {open && createPortal(popup, document.body)}
    </div>
  );
}