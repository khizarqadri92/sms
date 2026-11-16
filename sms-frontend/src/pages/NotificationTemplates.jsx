import React, { useState, useEffect, useRef } from "react";
import notificationTemplatesApi from "../api/notificationTemplatesApi";
import { useAuth } from "../auth/AuthContext";
import { useGovernanceMode } from "../hooks/useGovernanceMode";

export default function NotificationTemplates() {
  const { can } = useAuth();
  const { isGlobalLocked } = useGovernanceMode("notification_templates");
  const canManage = can("settings.manage") && !isGlobalLocked;
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [form, setForm] = useState({ title_template: "", body_template: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const lastFocusedRef = useRef("body");

  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000); };

  const load = () => {
    setLoading(true);
    notificationTemplatesApi.list()
      .then(r => {
        const rows = r.data.data || [];
        setTemplates(rows);
        if (rows.length > 0 && !selectedKey) selectTemplate(rows[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const selectTemplate = (t) => {
    setSelectedKey(t.event_key);
    setForm({ title_template: t.title_template, body_template: t.body_template, is_active: t.is_active });
  };

  const current = templates.find(t => t.event_key === selectedKey);

  const grouped = templates.reduce((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  const insertTag = (tag) => {
    const placeholder = `{{${tag}}}`;
    const field = lastFocusedRef.current === "title" ? "title_template" : "body_template";
    const el = field === "title_template" ? titleRef.current : bodyRef.current;
    const currentValue = form[field];
    if (el) {
      const start = el.selectionStart ?? currentValue.length;
      const end = el.selectionEnd ?? currentValue.length;
      const next = currentValue.slice(0, start) + placeholder + currentValue.slice(end);
      setForm(f => ({ ...f, [field]: next }));
      setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = start + placeholder.length; }, 0);
    } else {
      setForm(f => ({ ...f, [field]: currentValue + placeholder }));
    }
  };

  const save = async () => {
    if (!selectedKey) return;
    setSaving(true);
    try {
      await notificationTemplatesApi.update(selectedKey, form);
      showFlash("success", "Notification template saved.");
      load();
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to save.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div style={{ display: "flex", gap: 20, padding: "20px 24px", alignItems: "flex-start" }}>
      {/* Event picker */}
      <div style={{ width: 280, flexShrink: 0, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", fontWeight: 700, fontSize: 14 }}>
          Notification Events
        </div>
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
          {Object.keys(grouped).sort().map(cat => (
            <div key={cat}>
              <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", background: "#f8fafc" }}>
                {cat}
              </div>
              {grouped[cat].map(t => (
                <button key={t.event_key} onClick={() => selectTemplate(t)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "10px 16px", border: "none",
                    background: selectedKey === t.event_key ? "#eff6ff" : "transparent",
                    borderLeft: selectedKey === t.event_key ? "3px solid #2563eb" : "3px solid transparent",
                    cursor: "pointer", fontSize: 13, fontWeight: selectedKey === t.event_key ? 700 : 500,
                    color: selectedKey === t.event_key ? "#1d4ed8" : "#334155",
                  }}>
                  {t.display_name}
                  {!t.is_active && <span style={{ marginLeft: 6, fontSize: 10, color: "#94a3b8" }}>(off)</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24 }}>
        {flash && (
          <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 8, fontSize: 13,
            background: flash.type === "success" ? "#dcfce7" : "#fee2e2", color: flash.type === "success" ? "#166534" : "#991b1b" }}>
            {flash.msg}
          </div>
        )}
        {!current ? (
          <div style={{ color: "#94a3b8", padding: 30, textAlign: "center" }}>Select an event to configure.</div>
        ) : (
          <>
            {isGlobalLocked && (
              <div style={{ marginBottom: 16, padding: "8px 12px", borderRadius: 8, fontSize: 13, background: "#f1f5f9", color: "#475569" }}>
                This is managed centrally by the superadmin and cannot be changed here.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>{current.display_name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Sent to: {current.audience}</div>
                {"is_customized" in current && (
                  <span style={{
                    display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                    background: current.is_customized ? "#dcfce7" : "#f1f5f9",
                    color: current.is_customized ? "#166534" : "#64748b",
                  }}>
                    {current.is_customized ? "Customized for your campus" : "Using global default"}
                  </span>
                )}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: canManage ? "pointer" : "default" }}>
                <input type="checkbox" checked={form.is_active} disabled={!canManage}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                Enabled
              </label>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Notification Title</label>
              <input ref={titleRef} className="form-control" style={{ width: "100%" }} value={form.title_template} disabled={!canManage}
                onFocus={() => { lastFocusedRef.current = "title"; }}
                onChange={e => setForm(f => ({ ...f, title_template: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Message</label>
              <textarea ref={bodyRef} className="form-control" rows={5} style={{ width: "100%", resize: "vertical" }}
                value={form.body_template} disabled={!canManage}
                onFocus={() => { lastFocusedRef.current = "body"; }}
                onChange={e => setForm(f => ({ ...f, body_template: e.target.value }))} />
            </div>

            {current.available_tags && current.available_tags.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
                  Click a tag to insert it where your cursor is - it will be replaced with the real value when this notification is sent.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {current.available_tags.map(tag => (
                    <button key={tag} type="button" disabled={!canManage} onClick={() => insertTag(tag)}
                      style={{
                        padding: "4px 10px", borderRadius: 999, border: "1px solid #bfdbfe", background: "#eff6ff",
                        color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: canManage ? "pointer" : "default",
                      }}>
                      {"{{" + tag + "}}"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canManage && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? "Saving..." : "Save Template"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
