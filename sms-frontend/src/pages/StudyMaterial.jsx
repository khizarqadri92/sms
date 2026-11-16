import { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import materialsApi from "../api/materialsApi";
import academicsApi from "../api/academicsApi";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import "./StudyMaterial.css";

const FILE_ICONS = {
  pdf: "📄", doc:"📝", docx:"📝", xls:"📊", xlsx:"📊",
  ppt:"📋", pptx:"📋", jpg:"🖼️", jpeg:"🖼️", png:"🖼️",
  mp4:"🎬", zip:"📦", txt:"📃"
};
const FILE_COLORS = {
  pdf:"#dc2626", doc:"#2563eb", docx:"#2563eb", xls:"#16a34a",
  xlsx:"#16a34a", ppt:"#ea580c", pptx:"#ea580c", jpg:"#7c3aed",
  jpeg:"#7c3aed", png:"#7c3aed", mp4:"#0891b2", zip:"#64748b", txt:"#475569"
};

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/(1024*1024)).toFixed(1) + " MB";
}



export default function StudyMaterial() {
  const { formatDate: fmtDate } = useRegionalSettings();
  const formatDate = dt => dt ? fmtDate(dt) : "";
  const { user } = useAuth();
  const role = user?.roles?.[0];
  if (role === "student") return <StudentMaterials />;
  if (role === "parent")  return <ParentMaterials />;
  if (role === "principal" || role === "admin" || role === "superadmin" || role === "academic_coordinator") return <PrincipalMaterials />;
  return <TeacherMaterials role={role} />;
}

/* ── Principal: view all materials ────────────────────────────── */
function PrincipalMaterials() {
  const [materials, setMaterials] = useState([]);
  const [classes,   setClasses]   = useState([]);
  const [selClass,  setSelClass]  = useState("");
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    academicsApi.getClasses().then(r => setClasses(r.data.data || [])).catch(() => {});
    loadAll();
  }, []);

  useEffect(() => { loadAll(); }, [selClass]);

  const loadAll = () => {
    setLoading(true);
    materialsApi.list(selClass ? { class_id: selClass } : {})
      .then(r => setMaterials(r.data.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  };

  const handleDownload = async (m) => {
    try {
      const res = await materialsApi.download(m.id);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href=url; a.download=m.file_name; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed."); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Study Materials</h1>
        <select className="form-control sm-class-select" value={selClass} onChange={e => setSelClass(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
        </select>
      </div>
      {loading ? <div className="loading-state">Loading...</div> : materials.length === 0 ? (
        <div className="section-card"><div className="empty-state">No materials uploaded yet.</div></div>
      ) : (
        <div className="sm-list-stack">
          {materials.map(m => <MaterialCard key={m.id} m={m} onDownload={handleDownload} />)}
        </div>
      )}
    </div>
  );
}

/* ── Teacher Upload + View ───────────────────────────────────── */
function TeacherMaterials() {
  const { user } = useAuth();
  const can = user?.permissions || [];
  const [classes,   setClasses]   = useState([]);
  const [selClass,  setSelClass]  = useState("");
  const [subjects,  setSubjects]  = useState([]);
  const [selSubj,   setSelSubj]   = useState("");
  const [materials, setMaterials] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg,       setMsg]       = useState("");
  const [form,      setForm]      = useState({ title:"", description:"" });
  const fileRef = useRef();

  useEffect(() => {
    materialsApi.getMyClasses().then(r => {
      const cls = r.data.data || [];
      setClasses(cls);
      if (cls.length > 0) setSelClass(String(cls[0].id));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selClass) return;
    // Load only subjects THIS teacher teaches in selected class
    import("../api/diaryApi").then(m => {
      m.default.getMySubjects({ class_id: selClass }).then(r => {
        const subs = r.data.data || [];
        setSubjects(subs);
        setSelSubj(subs.length > 0 ? String(subs[0].id) : "");
      }).catch(() => {});
    });
  }, [selClass]);

  useEffect(() => { if (selClass) loadMaterials(); }, [selClass, selSubj]);

  const loadMaterials = () => {
    setLoading(true);
    materialsApi.list({ class_id: selClass, subject_id: selSubj || undefined })
      .then(r => setMaterials(r.data.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  };

  const handleUpload = async () => {
    if (!form.title || !selClass || !selSubj) { alert("Fill title, class and subject."); return; }
    if (!fileRef.current?.files[0]) { alert("Please select a file."); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append("class_id", selClass);
    fd.append("subject_id", selSubj);
    fd.append("title", form.title);
    fd.append("description", form.description);
    fd.append("file", fileRef.current.files[0]);
    try {
      await materialsApi.upload(fd);
      setMsg("Material uploaded successfully!");
      setForm({ title:"", description:"" });
      if (fileRef.current) fileRef.current.value = "";
      loadMaterials();
    } catch(e) { setMsg(e.response?.data?.message || "Upload failed."); }
    finally { setUploading(false); setTimeout(() => setMsg(""), 4000); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this material?")) return;
    try {
      await materialsApi.remove(id);
      loadMaterials();
    } catch { alert("Failed to delete."); }
  };

  const handleDownload = async (m) => {
    try {
      const res = await materialsApi.download(m.id);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = m.file_name; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed."); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Study Materials</h1>
      </div>

      <div className="sm-upload-grid">
        {/* Upload Panel */}
        {can.includes("material.upload") && (
        <div className="section-card">
          <div className="section-card-header"><span className="section-card-title">Upload Material</span></div>
          {msg && <div className="sm-success-msg">{msg}</div>}
          <div className="sm-form-stack">
            <div className="form-group">
              <label className="form-label">Class</label>
              <select className="form-control" value={selClass} onChange={e => setSelClass(e.target.value)}>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section?" ("+c.section+")":""}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Subject</label>
              <select className="form-control" value={selSubj} onChange={e => setSelSubj(e.target.value)}>
                <option value="">All Subjects</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-control" value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="e.g. Chapter 3 Notes" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-control" rows={2} value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Optional description..." />
            </div>
            <div className="form-group">
              <label className="form-label">File *</label>
              <input type="file" ref={fileRef} className="form-control"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.zip,.txt" />
              <div className="sm-help-text">PDF, Word, Excel, PPT, Images, ZIP</div>
            </div>
            <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
              {uploading ? "Uploading..." : "⬆ Upload Material"}
            </button>
          </div>
        </div>
        )}

        {/* Materials List */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Uploaded Materials</span>
            <span className="badge badge-gray">{materials.length} files</span>
          </div>
          {loading ? <div className="loading-state">Loading...</div> : materials.length === 0 ? (
            <div className="empty-state">No materials uploaded yet.</div>
          ) : (
            <div className="sm-list-stack">
              {materials.map(m => <MaterialCard key={m.id} m={m} onDownload={handleDownload} onDelete={can.includes("material.delete") ? handleDelete : null} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Student View ─────────────────────────────────────────────── */
function StudentMaterials() {
  const [materials, setMaterials] = useState([]);
  const [subjects,  setSubjects]  = useState([]);
  const [selSubj,   setSelSubj]   = useState("");
  const [loading,   setLoading]   = useState(true);
  const [classId,   setClassId]   = useState(null);

  useEffect(() => {
    import("../api/studentsApi").then(m => {
      m.default.getMyProfile().then(r => {
        const p = r.data.data;
        if (!p?.class_id) { setLoading(false); return; }
        setClassId(p.class_id);
        academicsApi.getClassSubjects(p.class_id).then(r2 => setSubjects(r2.data.data || [])).catch(() => {});
        materialsApi.list({ class_id: p.class_id })
          .then(r2 => setMaterials(r2.data.data || []))
          .catch(() => {}).finally(() => setLoading(false));
      }).catch(() => setLoading(false));
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    materialsApi.list({ class_id: classId, subject_id: selSubj || undefined })
      .then(r => setMaterials(r.data.data || [])).catch(() => {});
  }, [selSubj, classId]);

  const handleDownload = async (m) => {
    try {
      const res = await materialsApi.download(m.id);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href=url; a.download=m.file_name; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed."); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Study Materials</h1>
        <select className="form-control sm-class-select" value={selSubj} onChange={e => setSelSubj(e.target.value)}>
          <option value="">All Subjects</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
        </select>
      </div>
      {loading ? <div className="loading-state">Loading...</div> : materials.length === 0 ? (
        <div className="section-card"><div className="empty-state">No study materials available yet.</div></div>
      ) : (
        <div className="sm-grid-cards">
          {materials.map(m => <MaterialCard key={m.id} m={m} onDownload={handleDownload} grid />)}
        </div>
      )}
    </div>
  );
}

/* ── Parent View ──────────────────────────────────────────────── */
function ParentMaterials() {
  const [children,  setChildren]  = useState([]);
  const [selChild,  setSelChild]  = useState("");
  const [subjects,  setSubjects]  = useState([]);
  const [selSubj,   setSelSubj]   = useState("");
  const [materials, setMaterials] = useState([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    import("../api/studentsApi").then(m => {
      m.default.getMyChildren().then(r => {
        const kids = (r.data.data || []).filter(k => k.status !== 'withdrawn');
        setChildren(kids);
        if (kids.length > 0) setSelChild(String(kids[0].id));
      });
    });
  }, []);

  useEffect(() => {
    if (!selChild) return;
    const child = children.find(c => String(c.id) === selChild);
    if (!child?.class_id) return;
    academicsApi.getClassSubjects(child.class_id).then(r => setSubjects(r.data.data || [])).catch(() => {});
    setLoading(true);
    materialsApi.list({ class_id: child.class_id, subject_id: selSubj || undefined })
      .then(r => setMaterials(r.data.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, [selChild, selSubj, children]);

  const handleDownload = async (m) => {
    try {
      const res = await materialsApi.download(m.id);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href=url; a.download=m.file_name; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Download failed."); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">Study Materials</h1>
        <div className="sm-parent-select-row">
          <select className="form-control sm-select-180" value={selChild} onChange={e => { setSelChild(e.target.value); setSelSubj(""); }}>
            {children.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
          <select className="form-control sm-select-180" value={selSubj} onChange={e => setSelSubj(e.target.value)}>
            <option value="">All Subjects</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
          </select>
        </div>
      </div>
      {loading ? <div className="loading-state">Loading...</div> : materials.length === 0 ? (
        <div className="section-card"><div className="empty-state">No study materials available yet.</div></div>
      ) : (
        <div className="sm-grid-cards">
          {materials.map(m => <MaterialCard key={m.id} m={m} onDownload={handleDownload} grid />)}
        </div>
      )}
    </div>
  );
}

/* ── Material Card Component ──────────────────────────────────── */
function MaterialCard({ m, onDownload, onDelete, grid }) {
  const { formatDate: fmtDate } = useRegionalSettings();
  const formatDate = dt => dt ? fmtDate(dt) : "";
  const ext   = m.file_type || "";
  const icon  = FILE_ICONS[ext] || "📄";
  const color = FILE_COLORS[ext] || "#64748b";

  return (
    <div className="sm-card" style={{ "--card-flex-dir": grid ? "column" : "row", "--card-align": grid ? "flex-start" : "center" }}>
      <div className="sm-card-icon" style={{ "--icon-bg": color+"18", "--icon-color": color }}>
        {icon}
      </div>
      <div className="sm-card-body">
        <div className="sm-card-title">{m.title}</div>
        <div className="sm-card-meta">{m.class_name}{m.section?" ("+m.section+")":""} · {m.subject_name} · {m.teacher_name}</div>
        {m.description && <div className="sm-card-desc">{m.description}</div>}
        <div className="sm-card-tags-row">
          <span className="sm-ext-tag" style={{ "--tag-bg": color+"18", "--tag-color": color }}>{ext}</span>
          <span className="sm-meta-text">{formatSize(m.file_size)}</span>
          <span className="sm-meta-text">{formatDate(m.created_at)}</span>
        </div>
      </div>
      <div className="sm-card-actions">
        <button className="btn btn-ghost sm-download-btn" onClick={() => onDownload(m)}>⬇ Download</button>
        {onDelete && <button className="btn btn-ghost sm-delete-btn" onClick={() => onDelete(m.id)}>🗑</button>}
      </div>
    </div>
  );
}