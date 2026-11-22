import { useState, useEffect } from "react";
import { useAuth, effectiveRole } from "../auth/AuthContext";
import { syllabusApi } from "../api/syllabusApi";
import academicsApi from "../api/academicsApi";
import DatePicker from "../components/DatePicker";
import "./Syllabus.css";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";

const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
const SUBJECT_COLORS = ["#2563eb","#059669","#dc2626","#7c3aed","#d97706","#db2777","#0891b2","#65a30d","#ea580c","#6366f1"];

export default function Syllabus() {
  const processingToday = useProcessingToday();
  const { formatDate } = useRegionalSettings();
  const { user, can } = useAuth();
  const roles     = user?.roles || [];
  const role      = effectiveRole(user) || "";
  const canManage = can("academics.syllabus_edit");
  const canMark   = can("academics.syllabus_progress_marking");

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
      await syllabusApi.markTopic(selected.id, tid, { action, covered_at: processingToday, note: "" });
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

      {toast && <div className={(toastType === "error" ? "alert alert-error" : "alert alert-success") + " syl-toast"}>{toast}</div>}

      {/* Parent child selector */}
      {role === "parent" && children.length > 1 && (
        <div className="syl-child-filter-row">
          {children.filter(c => c.status !== "withdrawn").map(c => (
            <button key={c.id} onClick={() => setSelChild(String(c.id))} className="syl-child-filter-btn" style={{
              "--border-c": selChild===String(c.id) ? "#2563eb" : "var(--border-color)",
              "--bg-c": selChild===String(c.id) ? "var(--bg-info-soft)" : "var(--bg-card)",
              "--color-c": selChild===String(c.id) ? "#2563eb" : "var(--color-text-primary)",
              "--weight-c": selChild===String(c.id) ? 700 : 400,
            }}>
              {c.first_name} {c.last_name}
              <span className="syl-child-filter-class-text">{c.class_name}{c.section?" ("+c.section+")":""}</span>
            </button>
          ))}
        </div>
      )}

      <div className="syl-main-grid">

        {/* Left: Subject List */}
        <div className="syl-sidebar">
          <div className="syl-sidebar-header">
            <div className="syl-sidebar-title" style={{ marginBottom: canManage ? 8 : 0 }}>Subjects</div>
            {canManage && (
              <select className="form-control syl-class-filter-select" value={selClassFilter} onChange={e => setSelClassFilter(e.target.value)}>
                <option value="">All classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            )}
          </div>
          {list.length === 0 && (
            <div className="syl-sidebar-empty">
              No syllabus found.
            </div>
          )}
          {list.map((sy, idx) => {
            const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
            const isActive = selected?.id === sy.id;
            return (
              <div key={sy.id} onClick={() => loadSelected(sy.id)}
                className="syl-subject-row"
                style={{ "--border-left": isActive ? "4px solid " + color : "4px solid transparent", "--row-bg": isActive ? "var(--color-background-primary)" : "transparent" }}>
                <div className="syl-subject-dot-wrap" style={{ "--dotwrap-bg": color + "22" }}>
                  <div className="syl-subject-dot" style={{ "--dot-bg": color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="syl-subject-name" style={{ "--name-weight": isActive ? 700 : 500, "--name-color": isActive ? color : "var(--color-text-primary)" }}>
                    {sy.subject_name}
                  </div>
                  {sy.teacher_names && (
                    <div className="syl-subject-teacher">
                      {sy.teacher_names}
                    </div>
                  )}
                  <div className="syl-progress-track">
                    <div className="syl-progress-fill" style={{ "--fill-width": pct(sy)+"%", "--fill-bg": color }} />
                  </div>
                </div>
                <span className="syl-pct-text" style={{ "--pct-color": color }}>{pct(sy)}%</span>
              </div>
            );
          })}
        </div>

        {/* Right: Syllabus Detail */}
        {selected ? (
          <div className="syl-detail-pane">
            {/* Header */}
            <div className="syl-detail-header">
              <div className="syl-detail-icon">
                📚
              </div>
              <div style={{ flex: 1 }}>
                <div className="syl-detail-title">{selected.subject_name}</div>
                {selected.teacher_names && <div className="syl-detail-subtitle">Teacher: {selected.teacher_names}</div>}
                <div className="syl-detail-badges-row">
                  <span className="badge badge-gray">{selected.class_name}{selected.section ? " ("+selected.section+")" : ""}</span>
                  <span className="badge badge-gray">{selected.academic_year}</span>
                </div>
              </div>
              <div className="syl-detail-actions">
                {canManage && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditSyllabus({ id: selected.id, title: selected.title, description: selected.description })}>Edit</button>
                    <button className="btn btn-ghost btn-sm syl-delete-btn" onClick={() => deleteSyllabus(selected.id)}>Delete</button>
                  </>
                )}
              </div>
            </div>

            {/* Progress */}
            <div className="syl-progress-section">
              <div className="syl-progress-top-row">
                <div>
                  <div className="syl-progress-label">Overall Progress</div>
                  <div className="syl-progress-subtext">{selected.topics?.filter(t => t.covered_at).length || 0} of {selected.topics?.length || 0} topics covered</div>
                </div>
                <span className="syl-progress-pct" style={{ "--pct-color": pct(selected) === 100 ? "#166534" : "#2563eb" }}>{pct(selected)}%</span>
              </div>
              <div className="syl-overall-progress-track">
                <div className="syl-overall-progress-fill" style={{ "--fill-width": pct(selected)+"%", "--fill-bg": pct(selected) === 100 ? "#22c55e" : "#2563eb" }} />
              </div>
            </div>

            {/* Topics */}
            <div className="syl-topics-section">
              <div className="syl-topics-header-row">
                <div className="syl-topics-label">Topics</div>
                {canManage && (
                  <button className="btn btn-primary btn-sm syl-add-topic-btn" onClick={() => { setShowAddTopic(true); setMonthForm({ planned_month: "", month_title: "", weeks: [{ title: "", description: "", planned_week: "", planned_date: "" }] }); }}>
                    + Add Topic
                  </button>
                )}
              </div>

              {(!selected.topics || selected.topics.length === 0) ? (
                <div className="syl-no-topics-text">
                  No topics yet.{canManage ? " Click '+ Add Topic' to get started." : ""}
                </div>
              ) : (
                <div className="syl-groups-stack">
                  {groupByMonth(selected.topics).map((group) => {
                    const groupKey = (group.month||"0") + "||" + group.title;
                    const isOpen = expandedMonths[groupKey] !== false;
                    const coveredInGroup = group.topics.filter(t => t.covered_at).length;
                    const groupPct = group.topics.length > 0 ? Math.round((coveredInGroup / group.topics.length) * 100) : 0;
                    return (
                      <div key={groupKey} className="syl-group-card">
                        <div onClick={() => toggleMonth(groupKey)} className="syl-group-header"
                          style={{ "--border-bottom": isOpen ? "1px solid var(--color-border-tertiary)" : "none" }}>
                          <div className="syl-group-header-left">
                            <div className="syl-group-toggle-icon" style={{ "--icon-bg": isOpen ? "var(--bg-info-soft)" : "var(--color-background-tertiary)", "--icon-border": isOpen ? "#bfdbfe" : "var(--color-border-secondary)" }}>{isOpen ? "-" : "+"}</div>
                            <div>
                              <div className="syl-group-title">
                                {group.month ? MONTH_NAMES[group.month] : "General"} &nbsp;&mdash;&nbsp; {group.title}
                              </div>
                              <div className="syl-group-subtext">
                                {coveredInGroup} of {group.topics.length} topics covered
                              </div>
                            </div>
                          </div>
                          <div className="syl-group-header-right">
                            <div className="syl-group-progress-track">
                              <div className="syl-group-progress-fill" style={{ "--fill-width": groupPct+"%", "--fill-bg": groupPct===100?"#22c55e":"#2563eb" }} />
                            </div>
                            <span className="syl-group-pct" style={{ "--pct-color": groupPct===100?"#166534":"#2563eb" }}>{groupPct}%</span>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="syl-group-body">
                            {group.topics.map((t, i) => (
                              <div key={t.id} className="syl-topic-card" style={{ "--card-border": t.covered_at ? "#bbf7d0" : "var(--color-border-tertiary)", "--card-bg": t.covered_at ? "var(--bg-success-soft)" : "var(--bg-card)" }}>
                                <div className="syl-topic-top-row">
                                  <div className="syl-topic-left">
                                    <div className="syl-topic-num-badge" style={{ "--badge-bg": t.covered_at ? "#22c55e" : "var(--color-background-tertiary)", "--badge-color": t.covered_at ? "#fff" : "var(--color-text-secondary)" }}>{i + 1}</div>
                                    <div className="syl-topic-body">
                                      <div className="syl-topic-title">{t.title}</div>
                                      {t.description && <div className="syl-topic-desc">{t.description}</div>}
                                      <div className="syl-topic-tags-row">
                                        {t.planned_week && <span className="syl-topic-tag-week">Week {t.planned_week}</span>}
                                        {t.planned_date && <span className="syl-topic-tag-date">By {formatDate(t.planned_date)}</span>}
                                        {t.covered_at && <span className="syl-topic-tag-covered">Covered {formatDate(t.covered_at)}{t.covered_by_name?" by "+t.covered_by_name:""}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="syl-topic-actions">
                                    {canMarkSelected() && (
                                      t.covered_at
                                        ? <button className="btn btn-ghost btn-sm syl-uncover-btn" onClick={() => markTopic(t.id, "uncover")}>Uncover</button>
                                        : <button className="btn btn-ghost btn-sm syl-cover-btn" onClick={() => markTopic(t.id, "cover")}>Cover</button>
                                    )}
                                    {canManage && <>
                                      <button className="btn btn-ghost btn-sm" onClick={() => { const pd = t.planned_date ? new Date(t.planned_date).toISOString().split("T")[0] : ""; setEditTopic({ id: t.id, title: t.title, description: t.description||"", planned_week: t.planned_week||"", planned_month: t.planned_month||"", planned_date: pd }); }}>Edit</button>
                                      <button className="btn btn-ghost btn-sm syl-del-btn" onClick={() => deleteTopic(t.id)}>Del</button>
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
          <div className="syl-no-selection-text">
            Select a subject to view its syllabus.
          </div>
        )}
      </div>

      {/* Create Syllabus Modal */}
      {showCreate && (
        <div className="syl-modal-overlay">
          <div className="syl-modal-box-md">
            <div className="syl-modal-header">
              <div className="syl-modal-title">New Syllabus</div>
            </div>
            <div className="syl-modal-body-scroll">
              {createErr && <div className="alert alert-error" style={{ marginBottom: 14 }}>{createErr}</div>}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Class *</label>
                <select className="form-control" value={createForm.class_id} onChange={e => setCreateForm(f => ({ ...f, class_id: e.target.value, rows: [{ subject_id: "", title: "", description: "" }] }))}>
                  <option value="">Select class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
                </select>
              </div>

              {createForm.rows.map((row, idx) => (
                <div key={idx} className="syl-row-grid-4col" style={{ "--border-bottom": idx < createForm.rows.length - 1 ? "1px dashed var(--border-color)" : "none" }}>
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
                    <button type="button" className="btn btn-ghost btn-sm syl-remove-row-btn"
                      onClick={() => setCreateForm(f => ({ ...f, rows: f.rows.filter((_,i) => i!==idx) }))}>Remove</button>
                  )}
                </div>
              ))}

              <button type="button" className="btn btn-ghost btn-sm" disabled={!createForm.class_id}
                onClick={() => setCreateForm(f => ({ ...f, rows: [...f.rows, { subject_id: "", title: "", description: "" }] }))}>
                + Add More Subject
              </button>
            </div>
            <div className="syl-modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setCreateErr(""); }}>Cancel</button>
              <button className="btn btn-primary" onClick={createSyllabus}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Syllabus Modal */}
      {editSyllabus && (
        <div className="syl-modal-overlay">
          <div className="syl-modal-box-sm">
            <div className="syl-modal-header">
              <div className="syl-modal-title">Edit Syllabus</div>
            </div>
            <div className="syl-modal-body">
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Title *</label>
                <input className="form-control" value={editSyllabus.title} onChange={e => setEditSyllabus(s => ({ ...s, title: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" value={editSyllabus.description||""} onChange={e => setEditSyllabus(s => ({ ...s, description: e.target.value }))} style={{ minHeight: 70, resize: "vertical" }} />
              </div>
            </div>
            <div className="syl-modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditSyllabus(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={updateSyllabus}>Update</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Topic Modal */}
      {showAddTopic && (
        <div className="syl-modal-overlay">
          <div className="syl-modal-box-lg">
            <div className="syl-modal-header-rounded">
              <div className="syl-modal-title">Add Monthly Syllabus Topics</div>
              <div className="syl-modal-subtext">Select a month, set the title, then add weekly topics</div>
            </div>
            <div className="syl-modal-body-scroll">
              <div className="syl-modal-grid-2col">
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
              <div className="syl-weekly-section">
                <div className="syl-weekly-label">Weekly Topics</div>
                {monthForm.weeks.map((w, i) => (
                  <div key={i} className="syl-week-card">
                    <div className="syl-week-header">
                      <span className="syl-week-label">Week {i + 1}</span>
                      {monthForm.weeks.length > 1 && (
                        <button onClick={() => setMonthForm(f => ({ ...f, weeks: f.weeks.filter((_,idx) => idx !== i) }))}
                          className="syl-week-remove-btn">x</button>
                      )}
                    </div>
                    <div className="syl-week-grid">
                      <div className="form-group">
                        <label className="form-label">Week No.</label>
                        <input className="form-control" type="number" min={1} max={52} value={w.planned_week}
                          onChange={e => setMonthForm(f => { const wks=[...f.weeks]; wks[i]={...wks[i],planned_week:e.target.value}; return {...f,weeks:wks}; })} placeholder="e.g. 3" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Target Date</label>
                        <DatePicker value={w.planned_date}
                          onChange={val => setMonthForm(f => { const wks=[...f.weeks]; wks[i]={...wks[i],planned_date:val}; return {...f,weeks:wks}; })} />
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
                  className="syl-add-week-btn">
                  + Add Week
                </button>
              </div>
            </div>
            <div className="syl-modal-footer-rounded">
              <button className="btn btn-secondary" onClick={() => setShowAddTopic(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addMonthTopics}>Save Topics</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Topic Modal */}
      {editTopic && (
        <div className="syl-modal-overlay">
          <div className="syl-modal-box-sm">
            <div className="syl-modal-header">
              <div className="syl-modal-title">Edit Topic</div>
            </div>
            <div className="syl-modal-body">
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Title *</label>
                <input className="form-control" value={editTopic.title} onChange={e => setEditTopic(t => ({ ...t, title: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Description</label>
                <textarea className="form-control" value={editTopic.description||""} onChange={e => setEditTopic(t => ({ ...t, description: e.target.value }))} style={{ minHeight: 70, resize: "vertical" }} />
              </div>
              <div className="syl-row-grid-3col">
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
                  <DatePicker value={editTopic.planned_date||""} onChange={val => setEditTopic(t => ({ ...t, planned_date: val }))} />
                </div>
              </div>
            </div>
            <div className="syl-modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditTopic(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={updateTopic}>Update</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}