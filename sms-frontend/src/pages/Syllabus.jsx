import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { syllabusApi } from "../api/syllabusApi";
import academicsApi from "../api/academicsApi";

const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
const SUBJECT_COLORS = ["#2563eb","#059669","#dc2626","#7c3aed","#d97706","#db2777","#0891b2","#65a30d","#ea580c","#6366f1"];

export default function Syllabus() {
  const { user, can } = useAuth();
  const roles     = user?.roles || [];
  const role      = roles[0] || "";
  const canManage = can("syllabus.manage");
  const canMark   = can("syllabus.mark");

  const [list, setList]           = useState([]);
  const [classes, setClasses]     = useState([]);
  const [subjects, setSubjects]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [toast, setToast]         = useState("");
  const [toastType, setToastType] = useState("success");
  const [showCreate, setShowCreate]   = useState(false);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [editSyllabus, setEditSyllabus] = useState(null);
  const [editTopic, setEditTopic]       = useState(null);
  const [expandedMonths, setExpandedMonths] = useState({});
  const [selClassFilter, setSelClassFilter] = useState("");

  const [createForm, setCreateForm] = useState({ class_id: "", rows: [{ subject_id: "", title: "", description: "" }] });
  const [createErr, setCreateErr] = useState("");

  useEffect(() => {
    if (!createForm.class_id) { setSubjects([]); return; }
    academicsApi.getClassSubjects(createForm.class_id).then(r => setSubjects(r.data.data || [])).catch(() => setSubjects([]));
  }, [createForm.class_id]);
  const [children, setChildren]   = useState([]);
  const [selChild, setSelChild]   = useState("");
  const [monthForm, setMonthForm]   = useState({ planned_month: "", month_title: "", weeks: [{ title: "", description: "", planned_week: "", planned_date: "" }] });

  const flash = (type, text) => {
    setToastType(type); setToast(text);
    setTimeout(() => setToast(""), 3500);
  };

  useEffect(() => {
    if (role === "parent") {
      import("../api/studentsApi").then(({ default: sApi }) => {
        sApi.getMyChildren().then(r => {
          const allKids = r.data.data || [];
          setChildren(allKids);
          const activeKids = allKids.filter(k => k.status !== 'withdrawn');
          if (activeKids.length > 0) setSelChild(String(activeKids[0].id));
          else if (allKids.length > 0) setSelChild(String(allKids[0].id));
        }).catch(() => {});
      });
    } else {
      loadList();
    }
    if (canManage) {
      academicsApi.getClasses().then(r => setClasses(r.data.data?.items || r.data.data || [])).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (role !== "parent") loadList();
  }, [selClassFilter]);

  useEffect(() => {
    if (role === "parent" && selChild) {
      loadList(selChild);
    }
  }, [selChild]);

  const loadList = async (studentId, keepId) => {
    try {
      const params = studentId ? { student_id: studentId } : {};
      if (selClassFilter) params.class_id = selClassFilter;
      const r = await syllabusApi.getAll(params);
      const data = r.data.data || [];
      setList(data);
      const stillExists = keepId && data.some(d => d.id === keepId);
      if (stillExists) {
        loadSelected(keepId);
      } else if (data.length > 0) {
        loadSelected(data[0].id);
      } else {
        setSelected(null);
      }
    } catch { flash("error", "Failed to load syllabus."); }
  };

  const loadSelected = async (id) => {
    try {
      const r = await syllabusApi.getOne(id);
      setSelected(r.data.data);
    } catch { flash("error", "Failed to load syllabus details."); }
  };

  const pct = (s) => {
    if (!s) return 0;
    if (s.topics && s.topics.length > 0) {
      const covered = s.topics.filter(t => t.covered_at).length;
      return Math.round((covered / s.topics.length) * 100);
    }
    return s.total_topics > 0 ? Math.round((s.covered_topics / s.total_topics) * 100) : 0;
  };

  const groupByMonth = (topics) => {
    const groups = {};
    (topics || []).forEach(t => {
      const key = (t.planned_month || "0") + "||" + (t.month_group_title || "General");
      if (!groups[key]) groups[key] = { month: t.planned_month, title: t.month_group_title || "General", topics: [] };
      groups[key].topics.push(t);
    });
    return Object.values(groups).sort((a,b) => (a.month||99) - (b.month||99));
  };

  const toggleMonth = (key) => setExpandedMonths(prev => ({ ...prev, [key]: prev[key] === false ? true : false }));

  const canMarkSelected = () => {
    if (!canMark || !selected) return false;
    if (role !== "teacher") return true;
    const teacherSubjects = user?.subjects || [];
    if (teacherSubjects.length === 0) return true;
    return teacherSubjects.some(s => s.id === selected.subject_id || s.subject_id === selected.subject_id);
  };

  const createSyllabus = async () => {
    setCreateErr("");
    const validRows = createForm.rows.filter(r => r.subject_id && r.title.trim());
    if (!createForm.class_id || validRows.length === 0)
      return setCreateErr("Class, and at least one subject with a title, are required.");
    try {
      const results = await Promise.allSettled(
        validRows.map(r => syllabusApi.create({
          class_id: createForm.class_id,
          subject_id: r.subject_id,
          title: r.title,
          description: r.description,
        }))
      );
      const failed = results.filter(r => r.status === "rejected");
      if (failed.length > 0 && failed.length === results.length) {
        return setCreateErr(failed[0].reason?.response?.data?.message || "Failed to create syllabus.");
      }
      flash("success", (results.length - failed.length) + " syllabus(es) created." + (failed.length ? " " + failed.length + " failed." : ""));
      setShowCreate(false);
      setCreateForm({ class_id: "", rows: [{ subject_id: "", title: "", description: "" }] });
      loadList();
    } catch (e) { setCreateErr(e.response?.data?.message || "Failed to create."); }
  };

  const updateSyllabus = async () => {
    if (!editSyllabus?.title) return flash("error", "Title is required.");
    try {
      await syllabusApi.update(editSyllabus.id, { title: editSyllabus.title, description: editSyllabus.description });
      flash("success", "Syllabus updated.");
      setEditSyllabus(null);
      loadList();
      if (selected?.id === editSyllabus.id) loadSelected(editSyllabus.id);
    } catch (e) { flash("error", e.response?.data?.message || "Failed to update."); }
  };

  const deleteSyllabus = async (id) => {
    if (!window.confirm("Delete this syllabus and all its topics?")) return;
    try {
      await syllabusApi.remove(id);
      flash("success", "Syllabus deleted.");
      setSelected(null);
      loadList();
    } catch (e) { flash("error", e.response?.data?.message || "Failed to delete."); }
  };

  const addMonthTopics = async () => {
    if (!monthForm.planned_month) return flash("error", "Please select a month.");
    if (!monthForm.month_title) return flash("error", "Please enter a title for this month.");
    const validWeeks = monthForm.weeks.filter(w => w.title.trim());
    if (validWeeks.length === 0) return flash("error", "Add at least one week with a title.");
    try {
      for (const w of validWeeks) {
        await syllabusApi.addTopic(selected.id, {
          title: w.title, description: w.description,
          planned_week: w.planned_week || null,
          planned_month: monthForm.planned_month,
          planned_date: w.planned_date || null,
          month_group_title: monthForm.month_title,
        });
      }
      flash("success", validWeeks.length + " topic(s) added.");
      setShowAddTopic(false);
      setMonthForm({ planned_month: "", month_title: "", weeks: [{ title: "", description: "", planned_week: "", planned_date: "" }] });
      await loadSelected(selected.id);
      loadList(undefined, selected.id);
    } catch (e) { flash("error", e.response?.data?.message || "Failed to add topics."); }
  };

  const updateTopic = async () => {
    if (!editTopic?.title) return flash("error", "Title is required.");
    try {
      await syllabusApi.updateTopic(selected.id, editTopic.id, {
        title: editTopic.title, description: editTopic.description,
        planned_week: editTopic.planned_week || null,
        planned_month: editTopic.planned_month || null,
        planned_date: editTopic.planned_date || null,
      });
      flash("success", "Topic updated.");
      setEditTopic(null);
      await loadSelected(selected.id);
    } catch (e) { flash("error", e.response?.data?.message || "Failed to update."); }
  };

  const deleteTopic = async (tid) => {
    if (!window.confirm("Delete this topic?")) return;
    try {
      await syllabusApi.deleteTopic(selected.id, tid);
      flash("success", "Topic deleted.");
      await loadSelected(selected.id);
      loadList();
    } catch (e) { flash("error", e.response?.data?.message || "Failed."); }
  };

  const markTopic = async (tid, action) => {
    try {
      await syllabusApi.markTopic(selected.id, tid, { action, covered_at: new Date().toISOString().split("T")[0], note: "" });
      flash("success", action === "cover" ? "Topic marked as covered." : "Topic uncovered.");
      await loadSelected(selected.id);
      loadList(undefined, selected.id);
    } catch (e) { flash("error", e.response?.data?.message || "Failed."); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Syllabus</h1>
        {canManage && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Syllabus</button>}
      </div>

      {toast && <div className={toastType === "error" ? "alert alert-error" : "alert alert-success"} style={{ marginBottom: 16 }}>{toast}</div>}

      {/* Parent child selector */}
      {role === "parent" && children.length > 1 && (
        <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {children.filter(c => c.status !== "withdrawn").map(c => (
            <button key={c.id} onClick={() => setSelChild(String(c.id))} style={{
              padding: "6px 16px", borderRadius: 20, border: "1px solid",
              borderColor: selChild===String(c.id) ? "#2563eb" : "#e2e8f0",
              background: selChild===String(c.id) ? "#eff6ff" : "#fff",
              color: selChild===String(c.id) ? "#2563eb" : "var(--color-text-primary)",
              fontWeight: selChild===String(c.id) ? 700 : 400,
              fontSize: 13, cursor: "pointer",
            }}>
              {c.first_name} {c.last_name}
              <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>{c.class_name}{c.section?" ("+c.section+")":""}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 0, background: "#ffffff", borderRadius: 12, border: "1px solid var(--color-border-secondary)", overflow: "hidden", minHeight: 500 }}>

        {/* Left: Subject List */}
        <div style={{ borderRight: "1px solid var(--color-border-tertiary)", background: "#f8fafc", overflowY: "auto" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border-tertiary)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: canManage ? 8 : 0 }}>Subjects</div>
            {canManage && (
              <select className="form-control" style={{ fontSize: 12, padding: "4px 8px" }} value={selClassFilter} onChange={e => setSelClassFilter(e.target.value)}>
                <option value="">All classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            )}
          </div>
          {list.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)" }}>
              No syllabus found.
            </div>
          )}
          {list.map((sy, idx) => {
            const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
            const isActive = selected?.id === sy.id;
            return (
              <div key={sy.id} onClick={() => loadSelected(sy.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer",
                  borderLeft: isActive ? "4px solid " + color : "4px solid transparent",
                  borderBottom: "1px solid var(--color-border-tertiary)",
                  background: isActive ? "var(--color-background-primary)" : "transparent",
                  transition: "background 0.15s" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? color : "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {sy.subject_name}
                  </div>
                  {sy.teacher_names && (
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {sy.teacher_names}
                    </div>
                  )}
                  <div style={{ height: 3, background: "var(--color-border-tertiary)", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, width: pct(sy)+"%", background: color, transition: "width .3s" }} />
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: color, flexShrink: 0 }}>{pct(sy)}%</span>
              </div>
            );
          })}
        </div>

        {/* Right: Syllabus Detail */}
        {selected ? (
          <div style={{ display: "flex", flexDirection: "column", background: "#fff" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>
                📚
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--color-text-primary)" }}>{selected.subject_name}</div>
                {selected.teacher_names && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>Teacher: {selected.teacher_names}</div>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                  <span className="badge badge-gray">{selected.class_name}{selected.section ? " ("+selected.section+")" : ""}</span>
                  <span className="badge badge-gray">{selected.academic_year}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {canManage && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditSyllabus({ id: selected.id, title: selected.title, description: selected.description })}>Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-text-danger)" }} onClick={() => deleteSyllabus(selected.id)}>Delete</button>
                  </>
                )}
              </div>
            </div>

            {/* Progress */}
            <div style={{ padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid var(--color-border-tertiary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Overall Progress</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{selected.topics?.filter(t => t.covered_at).length || 0} of {selected.topics?.length || 0} topics covered</div>
                </div>
                <span style={{ fontSize: 22, fontWeight: 800, color: pct(selected) === 100 ? "#166534" : "#2563eb" }}>{pct(selected)}%</span>
              </div>
              <div style={{ height: 8, background: "var(--color-border-secondary)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, width: pct(selected)+"%", background: pct(selected) === 100 ? "#22c55e" : "#2563eb", transition: "width .3s" }} />
              </div>
            </div>

            {/* Topics */}
            <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Topics</div>
                {canManage && (
                  <button className="btn btn-primary btn-sm" style={{ color: "#fff" }} onClick={() => { setShowAddTopic(true); setMonthForm({ planned_month: "", month_title: "", weeks: [{ title: "", description: "", planned_week: "", planned_date: "" }] }); }}>
                    + Add Topic
                  </button>
                )}
              </div>

              {(!selected.topics || selected.topics.length === 0) ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
                  No topics yet.{canManage ? " Click '+ Add Topic' to get started." : ""}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {groupByMonth(selected.topics).map((group) => {
                    const groupKey = (group.month||"0") + "||" + group.title;
                    const isOpen = expandedMonths[groupKey] !== false;
                    const coveredInGroup = group.topics.filter(t => t.covered_at).length;
                    const groupPct = group.topics.length > 0 ? Math.round((coveredInGroup / group.topics.length) * 100) : 0;
                    return (
                      <div key={groupKey} style={{ border: "1px solid var(--color-border-secondary)", borderRadius: 10, overflow: "hidden" }}>
                        <div onClick={() => toggleMonth(groupKey)} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "12px 16px", background: "var(--color-background-secondary)",
                          cursor: "pointer", userSelect: "none",
                          borderBottom: isOpen ? "1px solid var(--color-border-tertiary)" : "none",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                              background: isOpen ? "#eff6ff" : "var(--color-background-tertiary)",
                              border: "1px solid " + (isOpen ? "#bfdbfe" : "var(--color-border-secondary)"),
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 15, fontWeight: 700, color: "#2563eb",
                            }}>{isOpen ? "-" : "+"}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>
                                {group.month ? MONTH_NAMES[group.month] : "General"} &nbsp;&mdash;&nbsp; {group.title}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 1 }}>
                                {coveredInGroup} of {group.topics.length} topics covered
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                            <div style={{ width: 80, height: 5, background: "var(--color-border-tertiary)", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 4, width: groupPct+"%", background: groupPct===100?"#22c55e":"#2563eb", transition: "width .3s" }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: groupPct===100?"#166534":"#2563eb", minWidth: 34, textAlign: "right" }}>{groupPct}%</span>
                          </div>
                        </div>

                        {isOpen && (
                          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8, background: "var(--color-background-primary)" }}>
                            {group.topics.map((t, i) => (
                              <div key={t.id} style={{
                                border: "1px solid " + (t.covered_at ? "#bbf7d0" : "var(--color-border-tertiary)"),
                                borderRadius: 8, padding: "10px 14px",
                                background: t.covered_at ? "#f0fdf4" : "#ffffff",
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                                    <div style={{
                                      width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                                      background: t.covered_at ? "#22c55e" : "var(--color-background-tertiary)",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      fontSize: 11, fontWeight: 700,
                                      color: t.covered_at ? "#fff" : "var(--color-text-secondary)",
                                    }}>{i + 1}</div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>{t.title}</div>
                                      {t.description && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 3, whiteSpace: "pre-wrap" }}>{t.description}</div>}
                                      <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                                        {t.planned_week && <span style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", padding: "1px 8px", borderRadius: 10, fontWeight: 600 }}>Week {t.planned_week}</span>}
                                        {t.planned_date && <span style={{ fontSize: 11, background: "#f0fdf4", color: "#166534", padding: "1px 8px", borderRadius: 10, fontWeight: 600 }}>By {new Date(t.planned_date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</span>}
                                        {t.covered_at && <span style={{ fontSize: 11, background: "#dcfce7", color: "#166534", padding: "1px 8px", borderRadius: 10, fontWeight: 600 }}>Covered {new Date(t.covered_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}{t.covered_by_name?" by "+t.covered_by_name:""}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                                    {canMarkSelected() && (
                                      t.covered_at
                                        ? <button className="btn btn-ghost btn-sm" style={{ color: "#64748b" }} onClick={() => markTopic(t.id, "uncover")}>Uncover</button>
                                        : <button className="btn btn-ghost btn-sm" style={{ color: "#166534" }} onClick={() => markTopic(t.id, "cover")}>Cover</button>
                                    )}
                                    {canManage && <>
                                      <button className="btn btn-ghost btn-sm" onClick={() => { const pd = t.planned_date ? new Date(t.planned_date).toISOString().split("T")[0] : ""; setEditTopic({ id: t.id, title: t.title, description: t.description||"", planned_week: t.planned_week||"", planned_month: t.planned_month||"", planned_date: pd }); }}>Edit</button>
                                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-text-danger)" }} onClick={() => deleteTopic(t.id)}>Del</button>
                                    </>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
            Select a subject to view its syllabus.
          </div>
        )}
      </div>

      {/* Create Syllabus Modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>New Syllabus</div>
            </div>
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {createErr && <div className="alert alert-error" style={{ marginBottom: 14 }}>{createErr}</div>}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Class *</label>
                <select className="form-control" value={createForm.class_id} onChange={e => setCreateForm(f => ({ ...f, class_id: e.target.value, rows: [{ subject_id: "", title: "", description: "" }] }))}>
                  <option value="">Select class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
                </select>
              </div>

              {createForm.rows.map((row, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "start", marginBottom: 12, paddingBottom: 12, borderBottom: idx < createForm.rows.length - 1 ? "1px dashed #e2e8f0" : "none" }}>
                  <div className="form-group">
                    <label className="form-label">Subject *</label>
                    <select className="form-control" value={row.subject_id} disabled={!createForm.class_id}
                      onChange={e => setCreateForm(f => ({ ...f, rows: f.rows.map((r,i) => i===idx ? { ...r, subject_id: e.target.value } : r) }))}>
                      <option value="">Select subject</option>
                      {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Title *</label>
                    <input className="form-control" value={row.title} placeholder="e.g. Term 1 Syllabus"
                      onChange={e => setCreateForm(f => ({ ...f, rows: f.rows.map((r,i) => i===idx ? { ...r, title: e.target.value } : r) }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <input className="form-control" value={row.description} placeholder="Optional"
                      onChange={e => setCreateForm(f => ({ ...f, rows: f.rows.map((r,i) => i===idx ? { ...r, description: e.target.value } : r) }))} />
                  </div>
                  {createForm.rows.length > 1 && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--color-text-danger)", marginTop: 22 }}
                      onClick={() => setCreateForm(f => ({ ...f, rows: f.rows.filter((_,i) => i!==idx) }))}>Remove</button>
                  )}
                </div>
              ))}

              <button type="button" className="btn btn-ghost btn-sm" disabled={!createForm.class_id}
                onClick={() => setCreateForm(f => ({ ...f, rows: [...f.rows, { subject_id: "", title: "", description: "" }] }))}>
                + Add More Subject
              </button>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f8fafc" }}>
              <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setCreateErr(""); }}>Cancel</button>
              <button className="btn btn-primary" onClick={createSyllabus}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Syllabus Modal */}
      {editSyllabus && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Edit Syllabus</div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Title *</label>
                <input className="form-control" value={editSyllabus.title} onChange={e => setEditSyllabus(s => ({ ...s, title: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" value={editSyllabus.description||""} onChange={e => setEditSyllabus(s => ({ ...s, description: e.target.value }))} style={{ minHeight: 70, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f8fafc" }}>
              <button className="btn btn-secondary" onClick={() => setEditSyllabus(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={updateSyllabus}>Update</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Topic Modal */}
      {showAddTopic && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "12px 12px 0 0", flexShrink: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Add Monthly Syllabus Topics</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Select a month, set the title, then add weekly topics</div>
            </div>
            <div style={{ padding: "20px 24px", flex: 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div className="form-group">
                  <label className="form-label">Month *</label>
                  <select className="form-control" value={monthForm.planned_month} onChange={e => setMonthForm(f => ({ ...f, planned_month: e.target.value }))}>
                    <option value="">Select month</option>
                    {MONTH_NAMES.slice(1).map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Month Title *</label>
                  <input className="form-control" value={monthForm.month_title} onChange={e => setMonthForm(f => ({ ...f, month_title: e.target.value }))} placeholder="e.g. Introduction to Numbers" />
                </div>
              </div>
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Weekly Topics</div>
                {monthForm.weeks.map((w, i) => (
                  <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Week {i + 1}</span>
                      {monthForm.weeks.length > 1 && (
                        <button onClick={() => setMonthForm(f => ({ ...f, weeks: f.weeks.filter((_,idx) => idx !== i) }))}
                          style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}>x</button>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div className="form-group">
                        <label className="form-label">Week No.</label>
                        <input className="form-control" type="number" min={1} max={52} value={w.planned_week}
                          onChange={e => setMonthForm(f => { const wks=[...f.weeks]; wks[i]={...wks[i],planned_week:e.target.value}; return {...f,weeks:wks}; })} placeholder="e.g. 3" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Target Date</label>
                        <input className="form-control" type="date" value={w.planned_date}
                          onChange={e => setMonthForm(f => { const wks=[...f.weeks]; wks[i]={...wks[i],planned_date:e.target.value}; return {...f,weeks:wks}; })} />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <label className="form-label">Topic Title *</label>
                      <input className="form-control" value={w.title}
                        onChange={e => setMonthForm(f => { const wks=[...f.weeks]; wks[i]={...wks[i],title:e.target.value}; return {...f,weeks:wks}; })}
                        placeholder="e.g. Chapter 1 - Introduction" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Description</label>
                      <textarea className="form-control" value={w.description}
                        onChange={e => setMonthForm(f => { const wks=[...f.weeks]; wks[i]={...wks[i],description:e.target.value}; return {...f,weeks:wks}; })}
                        placeholder="Topics covered this week..." style={{ minHeight: 60, resize: "vertical" }} />
                    </div>
                  </div>
                ))}
                <button onClick={() => setMonthForm(f => ({ ...f, weeks: [...f.weeks, { title: "", description: "", planned_week: "", planned_date: "" }] }))}
                  style={{ width: "100%", padding: "8px", border: "1px dashed #cbd5e1", borderRadius: 8, background: "none", cursor: "pointer", fontSize: 13, color: "#2563eb", fontWeight: 500 }}>
                  + Add Week
                </button>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f8fafc", borderRadius: "0 0 12px 12px", flexShrink: 0 }}>
              <button className="btn btn-secondary" onClick={() => setShowAddTopic(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addMonthTopics}>Save Topics</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Topic Modal */}
      {editTopic && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Edit Topic</div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Title *</label>
                <input className="form-control" value={editTopic.title} onChange={e => setEditTopic(t => ({ ...t, title: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Description</label>
                <textarea className="form-control" value={editTopic.description||""} onChange={e => setEditTopic(t => ({ ...t, description: e.target.value }))} style={{ minHeight: 70, resize: "vertical" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Week No.</label>
                  <input className="form-control" type="number" min={1} max={52} value={editTopic.planned_week||""} onChange={e => setEditTopic(t => ({ ...t, planned_week: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Month</label>
                  <select className="form-control" value={editTopic.planned_month||""} onChange={e => setEditTopic(t => ({ ...t, planned_month: e.target.value }))}>
                    <option value="">-</option>
                    {MONTH_NAMES.slice(1).map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Target Date</label>
                  <input className="form-control" type="date" value={editTopic.planned_date||""} onChange={e => setEditTopic(t => ({ ...t, planned_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end", background: "#f8fafc" }}>
              <button className="btn btn-secondary" onClick={() => setEditTopic(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={updateTopic}>Update</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}