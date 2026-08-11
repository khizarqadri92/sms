import { useState, useRef, useEffect } from "react";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEKDAY_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export default function DatePicker({ value, onChange, disabled, min, max, style, placeholder }) {
  const { formatDate, settings } = useRegionalSettings();
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? new Date(value) : new Date()));
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
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
      {open && (
        <div style={{
          position: "absolute", zIndex: 2000, top: "100%", left: 0, marginTop: 4, background: "#fff",
          border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", padding: 12, width: 260,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "2px 8px" }}>
              &#8249;
            </button>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{MONTH_NAMES[month]} {year}</div>
            <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "2px 8px" }}>
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
                      padding: "6px 0", fontSize: 12, border: "none", borderRadius: 6,
                      cursor: d && !disabledDay ? "pointer" : "default",
                      background: selected ? "#2563eb" : "transparent",
                      color: !d ? "transparent" : disabledDay ? "#cbd5e1" : selected ? "#fff" : "#0f172a",
                    }}>
                    {d || ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
