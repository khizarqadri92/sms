import { useState, useRef, useEffect } from "react";
import "./Admissions.css";

/**
 * Dropdown with checkboxes; the chosen items show outside as removable name tags.
 * groups: [{ label, items: [{ id, name, hint? }] }]   value: [id]   onChange(ids)
 */
export default function MultiSelectDropdown({ groups, value, onChange, placeholder = "Select...", noun = "selected", searchable = true }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);
  const all = groups.flatMap(g => g.items);
  const byId = Object.fromEntries(all.map(i => [String(i.id), i]));
  const chosen = value.map(v => byId[String(v)]).filter(Boolean);
  const toggle = id => onChange(value.some(v => String(v) === String(id)) ? value.filter(v => String(v) !== String(id)) : [...value, id]);
  const match = i => !q || i.name.toLowerCase().includes(q.toLowerCase());

  return (
    <div className="am-ms" ref={ref}>
      <div className="am-ms-anchor">
      <button type="button" className={"am-input am-ms-btn" + (open ? " am-ms-btn--open" : "")} onClick={() => setOpen(o => !o)}>
        <span className={chosen.length ? "" : "am-ms-ph"}>{chosen.length ? `${chosen.length} ${noun}` : placeholder}</span>
        <span className="am-ms-caret">&#9662;</span>
      </button>
      {open && (
        <div className="am-ms-menu">
          {searchable && <input className="am-input am-ms-search" autoFocus placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} />}
          <div className="am-ms-list">
            {groups.map(g => {
              const items = g.items.filter(match);
              if (!items.length) return null;
              return (
                <div key={g.label}>
                  <div className="am-ms-group">{g.label}</div>
                  {items.map(i => (
                    <label key={i.id} className="am-ms-item">
                      <input type="checkbox" checked={value.some(v => String(v) === String(i.id))} onChange={() => toggle(i.id)} />
                      <span>{i.name}{i.hint && <span className="am-hint"> · {i.hint}</span>}</span>
                    </label>
                  ))}
                </div>
              );
            })}
            {!all.filter(match).length && <div className="am-hint" style={{ padding: 10 }}>No matches.</div>}
          </div>
          {chosen.length > 0 && (
            <div className="am-ms-foot">
              <button type="button" className="am-btn am-btn--sm" onClick={() => onChange([])}>Clear all</button>
              <button type="button" className="am-btn am-btn--sm am-btn--primary" onClick={() => setOpen(false)}>Done</button>
            </div>
          )}
        </div>
      )}
      </div>
      {chosen.length > 0 && (
        <div className="am-ms-tags">
          {chosen.map(i => (
            <span key={i.id} className="am-ms-tag">{i.name}
              <button type="button" title={"Remove " + i.name} onClick={() => toggle(i.id)}>&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
