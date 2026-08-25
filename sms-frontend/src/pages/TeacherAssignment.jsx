import { useState, useEffect } from "react";
import academicsApi from "../api/academicsApi";

export default function TeacherAssignment() {
  const [classes, setClasses] = useState([]);
  const [classData, setClassData] = useState({}); // classId -> { subject_id: {subject_name, assigned_teacher_id, qualified_teachers} }
  const [grid, setGrid] = useState({}); // classId -> { subjectId: teacherId }
  const [loading, setLoading] = useState(true);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () => {
    setLoading(true); setError("");
    academicsApi.getClasses().then(r => {
      // Montessori classes have no fixed periods/subject-teacher structure
      // in the same sense as regular classes, so they\'re excluded from
      // this screen entirely.
      const classList = (r.data.data || []).filter(c => c.class_type !== "montessori");
      setClasses(classList);
      return Promise.all(classList.map(c => academicsApi.getClassSubjectTeachers(c.id).then(res => ({ classId: c.id, rows: res.data.data || [] }))));
    }).then(results => {
      const cd = {};
      const g = {};
      for (const { classId, rows } of results) {
        cd[classId] = {};
        g[classId] = {};
        for (const row of rows) {
          cd[classId][row.subject_id] = row;
          g[classId][row.subject_id] = row.assigned_teacher_id || "";
        }
      }
      setClassData(cd);
      setGrid(g);
    }).catch(() => setError("Failed to load classes and teacher options.")).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Union of all subjects that appear on at least one class, for row headers.
  const allSubjects = [];
  const seenSubjectIds = new Set();
  for (const classId of Object.keys(classData)) {
    for (const subjectId of Object.keys(classData[classId])) {
      if (!seenSubjectIds.has(subjectId)) {
        seenSubjectIds.add(subjectId);
        allSubjects.push({ id: subjectId, name: classData[classId][subjectId].subject_name });
      }
    }
  }
  allSubjects.sort((a, b) => a.name.localeCompare(b.name));

  const handleCellChange = (classId, subjectId, teacherId) => {
    setGrid(prev => ({ ...prev, [classId]: { ...prev[classId], [subjectId]: teacherId } }));
  };

  // Clears every cell in the draft grid (does not touch anything already
  // saved in the database) so Auto-Assign can be run fresh across all
  // subjects/classes, e.g. to check for and rebalance an overloaded
  // teacher, instead of Auto-Assign only filling in the cells that are
  // still empty.
  const handleClearAll = () => {
    const cleared = {};
    for (const classId of Object.keys(classData)) {
      cleared[classId] = {};
      for (const subjectId of Object.keys(classData[classId])) {
        cleared[classId][subjectId] = "";
      }
    }
    setGrid(cleared);
    setSuccess("");
    setError("");
  };

  // Recomputes every cell from scratch as a load-balanced draft suggestion
  // - nothing is saved until "Confirm & Save All" is clicked. This
  // deliberately overwrites any existing picks (manual or from a previous
  // suggestion): balancing load across teachers only works if every
  // class/subject pair is considered together, so a prior assignment can't
  // be left untouched while the rest are rebalanced around it.
  const handleAutoSuggest = () => {
    setAutoAssigning(true); setError(""); setSuccess("");
    const teacherLoad = {}; // teacherId -> number of class/subject pairs assigned so far
    const next = {};
    for (const classId of Object.keys(classData)) next[classId] = {};

    const pairs = [];
    for (const classId of Object.keys(classData)) {
      for (const subjectId of Object.keys(classData[classId])) {
        pairs.push({ classId, subjectId, options: classData[classId][subjectId].qualified_teachers || [] });
      }
    }

    // Pass 1: if a class\'s incharge is qualified to teach a subject for
    // their own class, they get it unconditionally - this is a fixed
    // priority rule, not something load-balancing should override. Without
    // this pass first, an incharge who already picked up load from other
    // classes could lose their own class\'s subject to a completely fresh
    // (lower-load) teacher, which defeats the point of having an incharge
    // teach their own class where possible.
    const remainingPairs = [];
    for (const pair of pairs) {
      const inchargeOption = pair.options.find(o => o.is_primary);
      if (inchargeOption) {
        next[pair.classId][pair.subjectId] = String(inchargeOption.id);
        teacherLoad[inchargeOption.id] = (teacherLoad[inchargeOption.id] || 0) + 1;
      } else {
        remainingPairs.push(pair);
      }
    }

    // Pass 2: everything left (no incharge option available) is load-
    // balanced across its qualified teachers. Pairs with fewer options are
    // handled first, since once a scarce teacher\'s load starts climbing
    // from easier-to-place pairs, a pair with only one possible teacher has
    // no fallback left.
    remainingPairs.sort((a, b) => a.options.length - b.options.length);
    for (const pair of remainingPairs) {
      if (pair.options.length === 0) continue;
      let best = pair.options[0];
      let bestLoad = teacherLoad[best.id] || 0;
      for (const opt of pair.options) {
        const load = teacherLoad[opt.id] || 0;
        if (load < bestLoad) { best = opt; bestLoad = load; }
      }
      next[pair.classId][pair.subjectId] = String(best.id);
      teacherLoad[best.id] = bestLoad + 1;
    }

    setGrid(next);
    setAutoAssigning(false);
    setSuccess("Load-balanced suggestions filled in below - review and click Confirm & Save All to apply.");
    setTimeout(() => setSuccess(""), 5000);
  };

  // Persists every cell currently shown in the grid (whether it came from
  // a manual pick or an auto-suggestion) to the database.
  const handleConfirmSave = async () => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const calls = [];
      for (const classId of Object.keys(grid)) {
        for (const subjectId of Object.keys(grid[classId])) {
          const teacherId = grid[classId][subjectId];
          if (teacherId) {
            calls.push(academicsApi.setClassSubjectTeacher(classId, { subject_id: parseInt(subjectId), teacher_id: parseInt(teacherId) }));
          }
        }
      }
      await Promise.all(calls);
      setSuccess("All teacher assignments saved.");
      setTimeout(() => setSuccess(""), 4000);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save some assignments.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-state">Loading teacher assignments...</div>;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Teacher Assignment</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleClearAll}>
            Clear All
          </button>
          <button className="btn btn-secondary" onClick={handleAutoSuggest} disabled={autoAssigning}>
            {autoAssigning ? "Suggesting..." : "Auto-Assign Teachers"}
          </button>
          <button className="btn btn-primary" onClick={handleConfirmSave} disabled={saving}>
            {saving ? "Saving..." : "Confirm & Save All"}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
        Fix exactly one teacher per subject for each class, so no teacher ends up overloaded across too many
        classes and the AI Timetable Generator knows exactly who to schedule. Auto-Assign only fills in
        empty cells as a suggestion - nothing is saved until you click Confirm & Save All. You can also pick
        any dropdown manually before confirming.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <div className="section-card" style={{ padding: 0, display: "flex", overflow: "hidden" }}>
        {/* Fixed left panel: subject names only. Never scrolls horizontally,
            so it stays visible no matter how far right the class panel is
            scrolled - avoids the sticky-cell-in-one-table approach, which
            had layout quirks with this table's mix of fixed and variable-
            content columns. */}
        <div style={{ flexShrink: 0, width: 160, borderRight: "1px solid #e2e8f0" }}>
          <table className="table" style={{ width: "100%", tableLayout: "fixed" }}>
            <thead>
              <tr><th style={{ height: 45 }}>Subject</th></tr>
            </thead>
            <tbody>
              {allSubjects.map(subj => (
                <tr key={subj.id} style={{ height: 90 }}><td style={{ fontWeight: 600, height: 90, maxHeight: 90, overflow: "hidden", boxSizing: "border-box" }}>{subj.name}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Scrollable right panel: one column per class, teacher dropdown
            per cell. Row heights match the left panel exactly so the two
            stay visually aligned as this panel scrolls independently. */}
        <div style={{ overflowX: "auto", flex: 1 }}>
          <table className="table" style={{ tableLayout: "fixed", minWidth: classes.length * 180 }}>
            <thead>
              <tr>
                {classes.map(c => (
                  <th key={c.id} style={{ whiteSpace: "nowrap", width: 180, minWidth: 180, height: 45 }}>{c.name}{c.section ? ` (${c.section})` : ""}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allSubjects.map(subj => (
                <tr key={subj.id} style={{ height: 90 }}>
                  {classes.map(c => {
                    const row = classData[c.id]?.[subj.id];
                    if (!row) return <td key={c.id} style={{ textAlign: "center", color: "#cbd5e1", height: 90, maxHeight: 90, overflow: "hidden", boxSizing: "border-box" }}>N/A</td>;
                    const options = row.qualified_teachers || [];
                    const currentValue = grid[c.id]?.[subj.id] || "";
                    const currentOption = options.find(o => String(o.id) === String(currentValue));
                    return (
                      <td key={c.id} style={{ height: 90, maxHeight: 90, overflow: "hidden", boxSizing: "border-box" }}>
                        <select
                          className="form-control"
                          value={currentValue}
                          onChange={e => handleCellChange(c.id, subj.id, e.target.value)}
                          style={{ minWidth: 140 }}
                        >
                          <option value="">Not assigned</option>
                          {options.map(o => <option key={o.id} value={o.id}>{o.name}{o.is_primary ? " (Incharge)" : ""}</option>)}
                        </select>
                        {currentOption?.is_primary && (
                          <span className="badge badge-primary" style={{ fontSize: 9, marginTop: 4, display: "inline-block" }}>Class Incharge</span>
                        )}
                        {options.length === 0 && (
                          <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>No qualified teacher</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
