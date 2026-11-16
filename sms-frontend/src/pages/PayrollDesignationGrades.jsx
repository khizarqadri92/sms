import React, { useState, useEffect, useCallback } from "react";
import payrollApi from "../api/payrollApi";
import "./PayrollDesignationGrades.css";

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

  if (loading) return <div className="pdg-loading">Loading...</div>;

  return (
    <div className="pdg-page">
      <div className="pdg-header">
        <div className="pdg-title">Designation - Grade Mapping</div>
        <div className="pdg-subtitle">Assign each designation to a payroll grade. A grade can be shared by multiple designations; a designation maps to exactly one grade.</div>
      </div>

      {flash && (
        <div className="pdg-flash" style={{
          "--flash-bg": flash.type === "success" ? "#dcfce7" : "#fee2e2",
          "--flash-color": flash.type === "success" ? "#166534" : "#dc2626"
        }}>
          {flash.type === "success" ? "\u2713 " : "\u26a0 "}{flash.msg}
        </div>
      )}

      <div className="pdg-table-wrap">
        <table className="pdg-table">
          <thead>
            <tr className="pdg-th-row">
              {["Department", "Designation", "Grade", ""].map(h => (
                <th key={h} className="pdg-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {designations.map(d => (
              <tr key={d.id} className="pdg-tr">
                <td className="pdg-td-dept">{d.department_name || "-"}</td>
                <td className="pdg-td-name">{d.name}</td>
                <td className="pdg-td-select">
                  <select className="form-input pdg-select"
                    value={mappings[d.id] || ""} onChange={e => setGradeFor(d.id, e.target.value)}>
                    <option value="">No grade assigned</option>
                    {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </td>
                <td className="pdg-td-actions">
                  <button className="btn btn-primary btn-sm pdg-save-btn" disabled={savingId === d.id} onClick={() => save(d.id)}>
                    {savingId === d.id ? "Saving..." : "Save"}
                  </button>
                  {mappings[d.id] && (
                    <button className="btn btn-ghost btn-sm pdg-remove-btn" onClick={() => remove(d.id)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
            {designations.length === 0 && (
              <tr><td colSpan={4} className="pdg-empty-td">No designations found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
