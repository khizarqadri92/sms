import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";

export default function PayrollDesignationGrades() {
  const [designations, setDesignations] = useState([]);
  const [grades, setGrades] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const showFlash = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000); };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      payrollApi.getDesignationsList(),
      payrollApi.getGrades(),
      payrollApi.getDesignationGrades(),
    ]).then(([d, g, m]) => {
      setDesignations(d.data.data || []);
      setGrades((g.data.data || []).filter(x => x.is_active));
      const map = {};
      (m.data.data || []).forEach(row => { map[row.designation_id] = row.grade_id; });
      setMappings(map);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const setGradeFor = (designationId, gradeId) => {
    setMappings(p => ({ ...p, [designationId]: gradeId }));
  };

  const save = async (designationId) => {
    const gradeId = mappings[designationId];
    if (!gradeId) { showFlash("error", "Select a grade first."); return; }
    setSavingId(designationId);
    try {
      await payrollApi.upsertDesignationGrade({ designation_id: designationId, grade_id: Number(gradeId) });
      showFlash("success", "Mapping saved.");
    } catch (e) {
      showFlash("error", e.response?.data?.message || "Failed to save.");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (designationId) => {
    try {
      await payrollApi.removeDesignationGrade(designationId);
      setMappings(p => { const n = { ...p }; delete n[designationId]; return n; });
      showFlash("success", "Mapping removed.");
    } catch (e) {
      showFlash("error", "Failed.");
    }
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>Loading...</div>;

  return (
    <div style={{ margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Designation - Grade Mapping</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Assign each designation to a payroll grade. A grade can be shared by multiple designations; a designation maps to exactly one grade.</div>
      </div>

      {flash && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: flash.type === "success" ? "#dcfce7" : "#fee2e2",
          color: flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "\u2713 " : "\u26a0 "}{flash.msg}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Department", "Designation", "Grade", ""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {designations.map(d => (
              <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 14px", fontSize: 13, color: "#64748b" }}>{d.department_name || "-"}</td>
                <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{d.name}</td>
                <td style={{ padding: "10px 14px" }}>
                  <select className="form-input" style={{ fontSize: 13, width: 200 }}
                    value={mappings[d.id] || ""} onChange={e => setGradeFor(d.id, e.target.value)}>
                    <option value="">No grade assigned</option>
                    {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </td>
                <td style={{ padding: "10px 14px", display: "flex", gap: 6 }}>
                  <button className="btn btn-primary btn-sm" style={{ color: "#fff", fontSize: 11 }} disabled={savingId === d.id} onClick={() => save(d.id)}>
                    {savingId === d.id ? "Saving..." : "Save"}
                  </button>
                  {mappings[d.id] && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: "#dc2626" }} onClick={() => remove(d.id)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
            {designations.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No designations found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
