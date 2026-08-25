import { useState, useEffect } from "react";
import academicsApi from "../api/academicsApi";

const DAY_OPTIONS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
];

export default function AcademicSetup() {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [dayMap, setDayMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedClassId) { setSubjects([]); setDayMap({}); return; }
    setLoading(true); setError(""); setSuccess("");
    Promise.all([
      academicsApi.getClassSubjects(selectedClassId),
      academicsApi.getClassSubjectDays(selectedClassId),
    ]).then(([subjRes, daysRes]) => {
      const subjList = subjRes.data.data || [];
      const daysList = daysRes.data.data || [];
      setSubjects(subjList);
      const map = {};
      for (const s of subjList) map[s.subject_id] = [];
      for (const d of daysList) map[d.subject_id] = (d.days || []).map(String);
      setDayMap(map);
    }).catch(() => setError("Failed to load subjects for this class.")).finally(() => setLoading(false));
  }, [selectedClassId]);

  const toggleDay = (subjectId, dayValue) => {
    setDayMap(prev => {
      const current = prev[subjectId] || [];
      const next = current.includes(dayValue) ? current.filter(d => d !== dayValue) : [...current, dayValue];
      return { ...prev, [subjectId]: next };
    });
  };

  const toggleAllDays = (subjectId) => {
    setDayMap(prev => {
      const current = prev[subjectId] || [];
      const allDays = DAY_OPTIONS.map(d => d.value);
      const next = current.length === allDays.length ? [] : allDays;
      return { ...prev, [subjectId]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const assignments = subjects.map(s => ({
        subject_id: s.subject_id,
        days: (dayMap[s.subject_id] || []).map(d => parseInt(d)),
      }));
      await academicsApi.setClassSubjectDays(selectedClassId, { assignments });
      setSuccess("Subject schedule saved.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save subject schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Academic Setup</h2>
      </div>
      <div className="section-card" style={{ marginBottom: 16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Subject Schedule Setup</span>
        </div>
        <div style={{ padding: "12px 0" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            Choose which weekdays each subject is taught for a class. The AI Timetable Generator will only
            schedule a subject on the days configured here.
          </div>
          <div className="form-group" style={{ maxWidth: 320, marginBottom: 16 }}>
            <label className="form-label">Class</label>
            <select className="form-control" value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
              <option value="">Select a class...</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ""}</option>
              ))}
            </select>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          {loading && <div className="loading-state">Loading subjects...</div>}
          {!loading && selectedClassId && subjects.length === 0 && (
            <div className="empty-state">No subjects assigned to this class yet.</div>
          )}
          {!loading && subjects.length > 0 && (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    {DAY_OPTIONS.map(d => <th key={d.value} style={{ textAlign: "center" }}>{d.label}</th>)}
                    <th style={{ textAlign: "center" }}>All</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map(s => {
                    const selected = dayMap[s.subject_id] || [];
                    return (
                      <tr key={s.subject_id}>
                        <td><strong>{s.subject_name}</strong></td>
                        {DAY_OPTIONS.map(d => (
                          <td key={d.value} style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={selected.includes(d.value)}
                              onChange={() => toggleDay(s.subject_id, d.value)}
                            />
                          </td>
                        ))}
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selected.length === DAY_OPTIONS.length}
                            onChange={() => toggleAllDays(s.subject_id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Schedule"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
