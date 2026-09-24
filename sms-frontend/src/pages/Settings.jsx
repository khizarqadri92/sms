import { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { useGovernanceMode } from "../hooks/useGovernanceMode";
import settingsApi from "../api/settingsApi";
import processingDateApi from "../api/processingDateApi";
import { useProcessingToday } from "../hooks/useProcessingToday";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import DatePicker from "../components/DatePicker";

const TABS = ["ID Formats", "School Info", "Fee Settings", "School Timing", "Attendance Config"];

export default function Settings({ visibleTabs } = {}) {
  const { can } = useAuth();
  const { isGlobalLocked: attendanceConfigLocked } = useGovernanceMode("attendance_config");
  const { isGlobalLocked: schoolTimingLocked } = useGovernanceMode("school_timing");
  const [tab,   setTab]   = useState(visibleTabs ? visibleTabs[0] : "id_formats");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const handler = (e) => {
      const sub = e.detail?.sub;
      if (["id_formats","school_info","fee_settings","school_timing","attendance_config","account_settings","regional_format"].includes(sub)) {
        setTab(sub);
      }
    };
    window.addEventListener("subnav-change", handler);
    return () => window.removeEventListener("subnav-change", handler);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 5000);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-heading">System Settings</h1>
      </div>

      {toast && (
        <div className="alert alert-success" style={{ marginBottom:16 }}>
          {toast}
        </div>
      )}

      {tab === "id_formats" && (!visibleTabs||visibleTabs.includes("id_formats")) && <IdFormatsTab       onSaved={() => showToast("Settings saved successfully.")} canManage={can("settings.manage")} />}
      {tab === "attendance_config" && (!visibleTabs||visibleTabs.includes("attendance_config")) && <AttendanceConfigTab onSaved={() => showToast("Settings saved successfully.")} canManage={can("settings.manage") && !attendanceConfigLocked} isGlobalLocked={attendanceConfigLocked} />}
      {tab === "school_info" && (!visibleTabs||visibleTabs.includes("school_info")) && <SchoolInfoTab  onSaved={() => showToast("School info saved.")} canManage={can("settings.manage")} />}
      {tab === "fee_settings" && (!visibleTabs||visibleTabs.includes("fee_settings")) && <FeeSettingsTab   onSaved={() => showToast("Fee settings saved.")} canManage={can("settings.manage")} />}
      {tab === "school_timing" && (!visibleTabs||visibleTabs.includes("school_timing")) && <SchoolTimingTab  onSaved={() => showToast("School timing saved.")} canManage={can("settings.manage") && !schoolTimingLocked} isGlobalLocked={schoolTimingLocked} />}
      {tab === "regional_format" && (!visibleTabs||visibleTabs.includes("regional_format")) && <RegionalFormatTab onSaved={() => showToast("Regional & format settings saved.")} canManage={can("settings.manage")} />}
      {tab === "account_settings" && (!visibleTabs||visibleTabs.includes("account_settings")) && <AccountSettingsTab onSaved={() => showToast("Account security settings saved.")} canManage={can("settings.manage")} />}
    </div>
  );
}

function IdFormatsTab({ onSaved, canManage }) {
  const processingToday = useProcessingToday();
  const [settings, setSettings]   = useState({});
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState(false);
  const [error,    setError]      = useState("");
  const [previews, setPreviews]   = useState({});
  const [mode, setMode]           = useState("per_department");
  const [staffSubMode, setStaffSubMode] = useState("same");
  const [departments, setDepartments]   = useState([]);
  const [selectedDept, setSelectedDept] = useState("");
  const [deptRoles, setDeptRoles]       = useState([]);

  const roleKeyMap = {
    student:"student_id", teacher:"teacher_id", admin:"admin_id",
    principal:"principal_id", finance_officer:"finance_id",
    parent:"parent_id", academic_coordinator:"coordinator_id",
    hr:"hr_id", librarian:"librarian_id", procurement:"procurement_id",
  };

  useEffect(() => {
    fetchSettings();
    import("../api/hrApi").then(m => {
      m.default.getDepartments().then(r => setDepartments(r.data.data||[])).catch(()=>{});
    });
  }, []);

  useEffect(() => {
    if(mode==="per_department" && selectedDept) {
      import("../api/hrApi").then(m => {
        m.default.getDeptRoles(selectedDept).then(r => setDeptRoles(r.data.data||[])).catch(()=>{});
      });
    }
  }, [selectedDept, mode]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await settingsApi.getAll();
      const flat = {};
      Object.values(res.data.data).forEach(group => {
        group.forEach(item => { flat[item.key] = item.value; });
      });
      setSettings(flat);
      if(flat.id_format_mode) setMode(flat.id_format_mode);
    } catch { setError("Failed to load settings."); }
    finally { setLoading(false); }
  };

  const handleChange = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const handlePreview = async (role) => {
    try {
      const res = await settingsApi.previewId(role);
      setPreviews(prev => ({ ...prev, [role]: res.data.data.preview_id }));
    } catch { setPreviews(prev => ({ ...prev, [role]: "Error" })); }
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const idSettings = { id_format_mode: mode };
      Object.keys(settings).forEach(k => {
        if (!k.includes("counter")) idSettings[k] = settings[k];
      });
      await settingsApi.update(idSettings);
      onSaved();
    } catch (err) { setError(err.response?.data?.message || "Failed to save."); }
    finally { setSaving(false); }
  };

  const FormatFields = ({ baseKey, label, roleKey }) => {
    const base = roleKey ? (roleKeyMap[roleKey]||null) : baseKey;
    if(!base) return <div style={{color:"#94a3b8",padding:12,fontSize:12}}>No format key configured for this role.</div>;
    const hasYear = roleKey==="student";
    return (
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:16,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13,color:"#334155"}}>{label}</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {previews[base] && <span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:"#2563eb",background:"#eff6ff",padding:"2px 8px",borderRadius:6}}>{previews[base]}</span>}
            {roleKey && <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>handlePreview(roleKey)}>Preview</button>}
          </div>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Prefix</label>
            <input className="form-control" value={settings[base+"_prefix"]||""} onChange={e=>handleChange(base+"_prefix",e.target.value)} placeholder="e.g. TCH, MGT" style={{fontFamily:"monospace",fontWeight:600}}/>
          </div>
          <div className="form-group">
            <label className="form-label">Separator</label>
            <select className="form-control" value={settings[base+"_separator"]||"-"} onChange={e=>handleChange(base+"_separator",e.target.value)}>
              <option value="-">Dash ( - )</option>
              <option value="/">Slash ( / )</option>
              <option value="_">Underscore ( _ )</option>
              <option value="">None</option>
            </select>
          </div>
          {hasYear && (
            <div className="form-group">
              <label className="form-label">Include Year</label>
              <select className="form-control" value={settings[base+"_year"]||"YYYY"} onChange={e=>handleChange(base+"_year",e.target.value)}>
                <option value="YYYY">Full year (2025)</option>
                <option value="YY">Short year (25)</option>
                <option value="none">No year</option>
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Sequence Digits</label>
            <select className="form-control" value={settings[base+"_digits"]||"4"} onChange={e=>handleChange(base+"_digits",e.target.value)}>
              <option value="3">3 digits (001)</option>
              <option value="4">4 digits (0001)</option>
              <option value="5">5 digits (00001)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Example Output</label>
            <div style={{padding:"9px 13px",background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:8,fontFamily:"monospace",fontSize:13,fontWeight:700,color:"#2563eb"}}>
              {(() => {
                const prefix = settings[base+"_prefix"]||"PRE";
                const sep = settings[base+"_separator"]||"-";
                const year = settings[base+"_year"];
                const digits = parseInt(settings[base+"_digits"]||"4");
                const seq = "1".padStart(digits,"0");
                if(year==="YYYY") return prefix+sep+new Date(processingToday).getFullYear()+sep+seq;
                if(year==="YY") return prefix+sep+String(new Date(processingToday).getFullYear()).slice(2)+sep+seq;
                return prefix+sep+seq;
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="loading-state">Loading settings...</div>;

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      {/* Mode Toggle */}
      <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"16px 20px",marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:12}}>ID FORMAT CONFIGURATION MODE</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[
            ["per_department","🏢 Per Department","Different format for each department"],
            ["per_staff","👥 Per Staff","Same or designation-based format for all staff"],
          ].map(([val,lbl,desc])=>(
            <label key={val} style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer",padding:"12px 16px",borderRadius:8,border:"2px solid "+(mode===val?"#2563eb":"#e2e8f0"),background:mode===val?"#eff6ff":"#f8fafc",flex:1,minWidth:200}}>
              <input type="radio" name="mode" value={val} checked={mode===val} onChange={()=>{setMode(val);handleChange("id_format_mode",val);}} style={{accentColor:"#2563eb",marginTop:2}}/>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:mode===val?"#2563eb":"#475569"}}>{lbl}</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* PER DEPARTMENT MODE */}
      {mode==="per_department" && (
        <div>
          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:16,marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:"#334155",marginBottom:8}}>SELECT DEPARTMENT</div>
            <select className="form-control" style={{maxWidth:320}} value={selectedDept} onChange={e=>setSelectedDept(e.target.value)}>
              <option value="">Choose a department...</option>
              {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {selectedDept && deptRoles.length===0 && <div style={{fontSize:12,color:"#94a3b8",marginTop:8}}>No roles assigned to this department.</div>}
          </div>
          {selectedDept && deptRoles.map(r=>(
            <FormatFields key={r.id} roleKey={r.name} label={r.name.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}/>
          ))}
          {/* Student & Parent always shown separately */}
          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:16,marginTop:8}}>
            <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:12}}>STUDENT & PARENT (Always Separate)</div>
            <FormatFields roleKey="student" label="Student Registration Number"/>
            <FormatFields roleKey="parent" label="Parent ID"/>
          </div>
        </div>
      )}

      {/* PER STAFF MODE */}
      {mode==="per_staff" && (
        <div>
          {/* Staff sub-mode */}
          <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:16,marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:"#334155",marginBottom:10}}>STAFF FORMAT TYPE</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[
                ["same","Same Format for All Staff","One universal format applied to all staff"],
                ["designation","By Designation Type","Separate format for Management vs Other Staff"],
              ].map(([val,lbl,desc])=>(
                <label key={val} style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer",padding:"10px 14px",borderRadius:8,border:"2px solid "+(staffSubMode===val?"#2563eb":"#e2e8f0"),background:staffSubMode===val?"#eff6ff":"#f8fafc",flex:1,minWidth:200}}>
                  <input type="radio" name="staffSubMode" value={val} checked={staffSubMode===val} onChange={()=>setStaffSubMode(val)} style={{accentColor:"#2563eb",marginTop:2}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:staffSubMode===val?"#2563eb":"#475569"}}>{lbl}</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {staffSubMode==="same" && (
            <div>
              <FormatFields baseKey="all_staff" label="All Staff — Universal Format"/>
              <div style={{borderTop:"1px solid #e2e8f0",paddingTop:16,marginTop:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:12}}>STUDENT & PARENT (Always Separate)</div>
                <FormatFields roleKey="student" label="Student Registration Number"/>
                <FormatFields roleKey="parent" label="Parent ID"/>
              </div>
            </div>
          )}

          {staffSubMode==="designation" && (
            <div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:12,padding:"8px 12px",background:"#fefce8",border:"1px solid #fef08a",borderRadius:8}}>
                💡 Management includes: Principal, Academic Coordinator, Admin, HR Manager. All others fall under Other Staff.
              </div>
              <FormatFields baseKey="management" label="Management Staff (Principal, Coordinator, Admin, HR)"/>
              <FormatFields baseKey="other_staff" label="Other Staff (Teacher, Finance, Librarian, Procurement)"/>
              <div style={{borderTop:"1px solid #e2e8f0",paddingTop:16,marginTop:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:12}}>STUDENT & PARENT (Always Separate)</div>
                <FormatFields roleKey="student" label="Student Registration Number"/>
                <FormatFields roleKey="parent" label="Parent ID"/>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",justifyContent:"flex-end",marginTop:20}}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving||!canManage}>
          {saving?"Saving...":"Save ID Format Settings"}
        </button>
      </div>
    </div>
  );
}


function SchoolInfoTab({ onSaved, canManage }) {
  const { isGlobalLocked: schoolNameLocked } = useGovernanceMode("school_name");
  const canManageName = canManage && !schoolNameLocked;
  const [nameForm, setNameForm] = useState({ school_name:"" });
  const [form,    setForm]    = useState({ school_city:"", school_phone:"", school_address:"", school_email:"", bank_name:"", bank_account:"", academic_year:"", school_logo:"" });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      settingsApi.getByCategory("school_name"),
      settingsApi.getByCategory("school_info"),
    ]).then(([nameRes, infoRes]) => {
      const nameData = nameRes.data.data || {};
      const infoData = infoRes.data.data || {};
      setNameForm({ school_name: nameData.school_name || "" });
      setForm({
        school_city:    infoData.school_city    || "",
        school_address: infoData.school_address || "",
        school_email:   infoData.school_email   || "",
        bank_name:      infoData.bank_name      || "",
        bank_account:   infoData.bank_account   || "",
        school_phone:   infoData.school_phone   || "",
        school_logo:    infoData.school_logo    || "",
        academic_year:  infoData.academic_year  || "",
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSaveName = async () => {
    setSavingName(true); setError("");
    try {
      await settingsApi.saveByCategory("school_name", nameForm);
      onSaved();
    } catch { setError("Failed to save school name."); }
    finally { setSavingName(false); }
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await settingsApi.saveByCategory("school_info", form);
      onSaved();
    } catch { setError("Failed to save."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">School Name</span>
        </div>
        <div style={{ fontSize:11, color:"#94a3b8", marginBottom:10 }}>Shared across all campuses.</div>
        {schoolNameLocked && (
          <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:12 }}>
            School Name is managed centrally by the superadmin. This field is read-only here.
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-grid">
          <div className="form-group form-grid-full">
            <label className="form-label">School Name</label>
            <input className="form-control" value={nameForm.school_name} onChange={e => setNameForm({...nameForm, school_name:e.target.value})} placeholder="e.g. Bright Future School" disabled={!canManageName} />
          </div>
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
          <button className="btn btn-primary" onClick={handleSaveName} disabled={savingName || !canManageName}>
            {savingName ? "Saving..." : "Save School Name"}
          </button>
        </div>
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">School Information</span>
        </div>
        <div style={{ fontSize:11, color:"#94a3b8", marginBottom:10 }}>Specific to this campus.</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">City</label>
            <input className="form-control" value={form.school_city} onChange={e => setForm({...form, school_city:e.target.value})} placeholder="e.g. Lahore" />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input className="form-control" value={form.school_phone} onChange={e => setForm({...form, school_phone:e.target.value})} placeholder="e.g. 042-1234567" />
          </div>
          <div className="form-group">
            <label className="form-label">Current Academic Year</label>
            <input className="form-control" value={form.academic_year} onChange={e => setForm({...form, academic_year:e.target.value})} placeholder="e.g. 2025-2026" />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-control" value={form.school_email} onChange={e => setForm({...form, school_email:e.target.value})} placeholder="e.g. info@school.com" />
          </div>
          <div className="form-group form-grid-full">
            <label className="form-label">Address</label>
            <input className="form-control" value={form.school_address} onChange={e => setForm({...form, school_address:e.target.value})} placeholder="e.g. 123 Main Street, Gulberg, Lahore" />
          </div>
          <div className="form-group">
            <label className="form-label">Bank Name</label>
            <input className="form-control" value={form.bank_name} onChange={e => setForm({...form, bank_name:e.target.value})} placeholder="e.g. HBL Bank" />
          </div>
          <div className="form-group">
            <label className="form-label">Bank Account No.</label>
            <input className="form-control" value={form.bank_account} onChange={e => setForm({...form, bank_account:e.target.value})} placeholder="e.g. 0123-456789012" />
          </div>
          <div className="form-group form-grid-full">
            <label className="form-label">School Logo</label>
            <div style={{ display:"flex", alignItems:"center", gap:16 }}>
              {form.school_logo && (
                <img src={form.school_logo} alt="School Logo" style={{ width:64, height:64, objectFit:"contain", border:"1px solid #e2e8f0", borderRadius:8, padding:4 }} />
              )}
              {!form.school_logo && (
                <div style={{ width:64, height:64, border:"2px dashed #e2e8f0", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#94a3b8" }}>
                  No logo
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  id="logo-upload"
                  style={{ display:"none" }}
                  onChange={e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 200000) { alert("Logo must be under 200KB."); return; }
                    const reader = new FileReader();
                    reader.onload = ev => setForm({...form, school_logo: ev.target.result});
                    reader.readAsDataURL(file);
                  }}
                />
                <label htmlFor="logo-upload" className="btn btn-secondary" style={{ cursor:"pointer", display:"inline-block" }}>
                  Upload Logo
                </label>
                {form.school_logo && (
                  <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft:8 }} onClick={() => setForm({...form, school_logo:""})}>
                    Remove
                  </button>
                )}
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:6 }}>PNG, JPG or SVG. Max 200KB. Will appear on invoice PDF.</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !canManage}>
            {saving ? "Saving..." : "Save School Info"}
          </button>
        </div>
      </div>
    </div>
  );
}
function FeeSettingsTab({ onSaved, canManage }) {
  const processingToday = useProcessingToday();
  const { formatDate } = useRegionalSettings();
  const [form,    setForm]    = useState({
    fee_due_day:         "10",
    fee_grace_days:      "3",
    fee_reminder1_days:  "5",
    fee_reminder2_days:  "10",
    fee_lock_days:       "15",
    fee_late_type:       "none",
    fee_late_fixed:      "0",
    fee_late_percentage: "0",
    fee_reminder_time:   "08:00",
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [running, setRunning] = useState(false);
  const [runMsg,  setRunMsg]  = useState("");

  useEffect(() => {
    settingsApi.getFeeSettings()
      .then(res => {
        const data = res.data.data || {};
        setForm(prev => ({ ...prev, ...data }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await settingsApi.updateFeeSettings(form);
      onSaved();
    } catch { setError("Failed to save fee settings."); }
    finally { setSaving(false); }
  };

  const handleRunNow = async () => {
    setRunning(true); setRunMsg("");
    try {
      const res = await import("../api/client").then(m => m.default.post("/finance/run-fee-reminders"));
      const d = res.data.data;
      setRunMsg(`Done: ${d.notice1} 1st notices, ${d.notice2} 2nd notices, ${d.locked} accounts locked, ${d.skipped} skipped.`);
    } catch { setRunMsg("Failed to run reminders."); }
    finally { setRunning(false); }
  };

  if (loading) return <div className="loading-state">Loading fee settings...</div>;

  const exampleDueDate     = new Date(processingToday); exampleDueDate.setDate(parseInt(form.fee_due_day));
  const exampleReminder1   = new Date(exampleDueDate); exampleReminder1.setDate(exampleReminder1.getDate() + parseInt(form.fee_reminder1_days));
  const exampleReminder2   = new Date(exampleDueDate); exampleReminder2.setDate(exampleReminder2.getDate() + parseInt(form.fee_reminder2_days));
  const exampleLock        = new Date(exampleDueDate); exampleLock.setDate(exampleLock.getDate() + parseInt(form.fee_lock_days));

  const fmt = d => formatDate(d);

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Monthly Fee Due Date</span>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Due Day of Month *</label>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input
                className="form-control"
                type="number"
                min="1" max="28"
                value={form.fee_due_day}
                onChange={e => setForm({...form, fee_due_day:e.target.value})}
                style={{ width:100 }}
              />
              <span style={{ fontSize:13, color:"#64748b" }}>
                Every month fee is due on the <strong>{form.fee_due_day}{form.fee_due_day === "1" ? "st" : form.fee_due_day === "2" ? "nd" : form.fee_due_day === "3" ? "rd" : "th"}</strong>
              </span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Grace Period (days)</label>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input
                className="form-control"
                type="number"
                min="0" max="30"
                value={form.fee_grace_days}
                onChange={e => setForm({...form, fee_grace_days:e.target.value})}
                style={{ width:100 }}
              />
              <span style={{ fontSize:13, color:"#64748b" }}>days after due before late fee applies</span>
            </div>
          </div>
        </div>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Reminders & Account Lock</span>
          <span className="badge badge-gray">Days after due date</span>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Reminder 1 — after due date</label>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input
                className="form-control"
                type="number"
                min="1" max="60"
                value={form.fee_reminder1_days}
                onChange={e => setForm({...form, fee_reminder1_days:e.target.value})}
                style={{ width:100 }}
              />
              <span style={{ fontSize:13, color:"#d97706" }}>days — send first reminder notification</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Reminder 2 — after due date</label>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input
                className="form-control"
                type="number"
                min="1" max="60"
                value={form.fee_reminder2_days}
                onChange={e => setForm({...form, fee_reminder2_days:e.target.value})}
                style={{ width:100 }}
              />
              <span style={{ fontSize:13, color:"#ea580c" }}>days — send urgent reminder notification</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Account Lock — after due date</label>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input
                className="form-control"
                type="number"
                min="1" max="90"
                value={form.fee_lock_days}
                onChange={e => setForm({...form, fee_lock_days:e.target.value})}
                style={{ width:100 }}
              />
              <span style={{ fontSize:13, color:"#dc2626" }}>days — lock student account if not paid</span>
            </div>
          </div>
        </div>

        <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"16px 20px", marginTop:8 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", marginBottom:12 }}>Timeline Preview (this month)</div>
          <div style={{ display:"flex", alignItems:"center", gap:0, overflowX:"auto" }}>
            {[
              { label:"Due Date",   date:fmt(exampleDueDate),   color:"#16a34a", bg:"#f0fdf4" },
              { label:"Reminder 1", date:fmt(exampleReminder1),  color:"#d97706", bg:"#fffbeb" },
              { label:"Reminder 2", date:fmt(exampleReminder2),  color:"#ea580c", bg:"#fff7ed" },
              { label:"Lock",       date:fmt(exampleLock),       color:"#dc2626", bg:"#fef2f2" },
            ].map((item, i, arr) => (
              <div key={item.label} style={{ display:"flex", alignItems:"center" }}>
                <div style={{ textAlign:"center", minWidth:90 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:item.bg, border:"2px solid " + item.color, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 6px", fontSize:10, fontWeight:700, color:item.color }}>
                    {item.date.split(" ")[1]}
                  </div>
                  <div style={{ fontSize:10, fontWeight:700, color:item.color }}>{item.label}</div>
                  <div style={{ fontSize:10, color:"#94a3b8" }}>{item.date}</div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ height:2, width:30, background:"#e2e8f0", flexShrink:0 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {runMsg && <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:13, color:"#16a34a" }}>{runMsg}</div>}

      <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"12px 14px", marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#1d4ed8", marginBottom:8 }}>Automatic Schedule</div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
          <input
            className="form-control"
            type="time"
            value={form.fee_reminder_time || "08:00"}
            onChange={e => setForm({...form, fee_reminder_time:e.target.value})}
            disabled={!canManage}
            style={{ width:140 }}
          />
          <span style={{ fontSize:12, color:"#3b82f6" }}>Fee reminders, late fees, and account locks run automatically every day at this time.</span>
        </div>
        {form.fee_reminder_last_run && (
          <div style={{ fontSize:11, color:"#94a3b8" }}>Last ran: {form.fee_reminder_last_run}</div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
        <button className="btn btn-ghost" onClick={handleRunNow} disabled={running} style={{ color:"#7c3aed", fontSize:12 }}>
          {running ? "Running..." : "Run Reminders Now (Manual)"}
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !canManage}>
          {saving ? "Saving..." : "Save Fee Settings"}
        </button>
      </div>
    </div>
  );
}

function SchoolTimingTab({ onSaved, canManage, isGlobalLocked }) {
  const DAYS = [
    { value:"1", label:"Monday" },
    { value:"2", label:"Tuesday" },
    { value:"3", label:"Wednesday" },
    { value:"4", label:"Thursday" },
    { value:"5", label:"Friday" },
    { value:"6", label:"Saturday" },
    { value:"7", label:"Sunday" },
  ];

  const [form, setForm] = useState({
    school_start_time: "08:00",
    school_end_time:   "14:00",
    period_duration:   "45",
    break_start_time:  "10:30",
    break_duration:    "20",
    working_days:      ["1","2","3","4","5"],
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    settingsApi.getByCategory("school_timing").then(r => {
      const flat = r.data.data || {};
      setForm({
        school_start_time: flat.school_start_time || "08:00",
        school_end_time:   flat.school_end_time   || "14:00",
        period_duration:   flat.period_duration   || "45",
        break_start_time:  flat.break_start_time  || "10:30",
        break_duration:    flat.break_duration    || "20",
        working_days:      flat.working_days ? flat.working_days.split(",") : ["1","2","3","4","5"],
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleDay = (val) => {
    setForm(f => ({
      ...f,
      working_days: f.working_days.includes(val)
        ? f.working_days.filter(d => d !== val)
        : [...f.working_days, val].sort()
    }));
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await settingsApi.saveByCategory("school_timing", {
        ...form,
        working_days: form.working_days.join(","),
      });
      onSaved();
    } catch { setError("Failed to save."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">School Timing & Schedule</span>
      </div>
      {isGlobalLocked && (
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          School Timing is managed centrally by the superadmin. This section is read-only here.
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#0f172a", marginBottom:12 }}>Working Days</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {DAYS.map(d => (
            <label key={d.value} style={{
              display:"flex", alignItems:"center", gap:8, cursor:"pointer",
              padding:"8px 16px", borderRadius:8, border:"1px solid",
              borderColor: form.working_days.includes(d.value) ? "#2563eb" : "#e2e8f0",
              background: form.working_days.includes(d.value) ? "#eff6ff" : "var(--color-background-primary)",
              fontSize:13, fontWeight: form.working_days.includes(d.value) ? 600 : 400,
              color: form.working_days.includes(d.value) ? "#1d4ed8" : "var(--color-text-primary)",
            }}>
              <input
                type="checkbox"
                checked={form.working_days.includes(d.value)}
                onChange={() => toggleDay(d.value)}
                style={{ width:15, height:15 }}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ fontSize:13, fontWeight:600, color:"#0f172a", marginBottom:12 }}>Daily Schedule</div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">School Start Time</label>
          <input className="form-control" type="time" value={form.school_start_time}
            onChange={e => setForm({...form, school_start_time:e.target.value})} />
        </div>
        <div className="form-group">
          <label className="form-label">School End Time</label>
          <input className="form-control" type="time" value={form.school_end_time}
            onChange={e => setForm({...form, school_end_time:e.target.value})} />
        </div>
        <div className="form-group">
          <label className="form-label">Period Duration (minutes)</label>
          <input className="form-control" type="number" min="15" max="120" value={form.period_duration}
            onChange={e => setForm({...form, period_duration:e.target.value})} />
        </div>
        <div className="form-group">
          <label className="form-label">Break Start Time</label>
          <input className="form-control" type="time" value={form.break_start_time}
            onChange={e => setForm({...form, break_start_time:e.target.value})} />
        </div>
        <div className="form-group">
          <label className="form-label">Break Duration (minutes)</label>
          <input className="form-control" type="number" min="5" max="60" value={form.break_duration}
            onChange={e => setForm({...form, break_duration:e.target.value})} />
        </div>
      </div>

      <div style={{ background:"#f8fafc", borderRadius:8, padding:"12px 16px", marginBottom:16, fontSize:12, color:"#64748b" }}>
        <strong>Schedule preview:</strong> School runs {form.school_start_time}–{form.school_end_time} with {form.period_duration}-min periods.
        Break at {form.break_start_time} for {form.break_duration} mins.
        Working {form.working_days.length} days/week ({form.working_days.map(d => ["","Mon","Tue","Wed","Thu","Fri","Sat","Sun"][parseInt(d)]).join(", ")}).
      </div>

      {canManage && (
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Timing Settings"}
        </button>
      )}

      <TimingOverridesSection canManage={canManage} />
    </div>
  );
}

function TimingOverridesSection({ canManage }) {
  const { formatDate } = useRegionalSettings();
  const WEEKDAYS = [
    { value: "1", label: "Monday" },
    { value: "2", label: "Tuesday" },
    { value: "3", label: "Wednesday" },
    { value: "4", label: "Thursday" },
    { value: "5", label: "Friday" },
    { value: "6", label: "Saturday" },
    { value: "7", label: "Sunday" },
  ];
  const EMPTY_FORM = {
    id: null, label: "", mode: "weekday", day_of_week: "1", override_date: "",
    start_time: "08:00", end_time: "12:00", break_start_time: "", break_duration: "",
    period_duration: "40", is_active: true,
  };
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    settingsApi.getTimingOverrides().then(r => setOverrides(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const startEdit = (o) => {
    setForm({
      id: o.id, label: o.label,
      mode: o.day_of_week ? "weekday" : "date",
      day_of_week: o.day_of_week ? String(o.day_of_week) : "1",
      override_date: o.override_date || "",
      start_time: o.start_time, end_time: o.end_time,
      break_start_time: o.break_start_time || "", break_duration: o.break_duration ? String(o.break_duration) : "",
      period_duration: String(o.period_duration), is_active: o.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this timing override?")) return;
    await settingsApi.deleteTimingOverride(id);
    load();
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const payload = {
        id: form.id,
        label: form.label,
        day_of_week: form.mode === "weekday" ? parseInt(form.day_of_week) : null,
        override_date: form.mode === "date" ? form.override_date : null,
        start_time: form.start_time,
        end_time: form.end_time,
        break_start_time: form.break_start_time || null,
        break_duration: form.break_duration ? parseInt(form.break_duration) : null,
        period_duration: parseInt(form.period_duration),
        is_active: form.is_active,
      };
      if (!payload.label) { setError("Label is required."); setSaving(false); return; }
      if (form.mode === "date" && !payload.override_date) { setError("Date is required."); setSaving(false); return; }
      await settingsApi.saveTimingOverride(payload);
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save override.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Day-Specific Timing Overrides</div>
        {canManage && (
          <button className="btn btn-secondary" onClick={() => { setForm(EMPTY_FORM); setShowForm(!showForm); setError(""); }}>
            {showForm ? "Cancel" : "+ Add Override"}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
        Configure a different schedule for a recurring weekday (e.g. every Friday is a short day) or a
        specific calendar date (e.g. a half day before a holiday). The AI Timetable Generator and
        attendance/period calculations will use these instead of the default schedule above on matching days.
      </div>

      {showForm && (
        <div className="section-card" style={{ marginBottom: 16, background: "var(--color-background-secondary)" }}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-grid">
            <div className="form-group form-grid-full">
              <label className="form-label">Label *</label>
              <input className="form-control" value={form.label} placeholder="e.g. Friday Short Day"
                onChange={e => setForm({ ...form, label: e.target.value })} />
            </div>
            <div className="form-group form-grid-full">
              <label className="form-label">Applies To</label>
              <div style={{ display: "flex", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="radio" checked={form.mode === "weekday"} onChange={() => setForm({ ...form, mode: "weekday" })} />
                  Recurring weekday
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="radio" checked={form.mode === "date"} onChange={() => setForm({ ...form, mode: "date" })} />
                  Specific date
                </label>
              </div>
            </div>
            {form.mode === "weekday" ? (
              <div className="form-group">
                <label className="form-label">Weekday</label>
                <select className="form-control" value={form.day_of_week} onChange={e => setForm({ ...form, day_of_week: e.target.value })}>
                  {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Date</label>
                <DatePicker value={form.override_date} onChange={val => setForm({ ...form, override_date: val })} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <input className="form-control" type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">End Time</label>
              <input className="form-control" type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Period Duration (minutes)</label>
              <input className="form-control" type="number" min="15" max="120" value={form.period_duration} onChange={e => setForm({ ...form, period_duration: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Break Start Time (optional)</label>
              <input className="form-control" type="time" value={form.break_start_time} onChange={e => setForm({ ...form, break_start_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Break Duration (minutes, optional)</label>
              <input className="form-control" type="number" min="0" max="60" value={form.break_duration} onChange={e => setForm({ ...form, break_duration: e.target.value })} />
            </div>
            <div className="form-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 24 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                Active
              </label>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : form.id ? "Update Override" : "Add Override"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading overrides...</div>
      ) : overrides.length === 0 ? (
        <div className="empty-state">No day-specific overrides configured.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Applies To</th>
              <th>Timing</th>
              <th>Status</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {overrides.map(o => (
              <tr key={o.id}>
                <td><strong>{o.label}</strong></td>
                <td>{o.day_of_week ? WEEKDAYS.find(d => d.value === String(o.day_of_week))?.label : formatDate(o.override_date)}</td>
                <td>
                  {o.start_time}-{o.end_time}, {o.period_duration}min periods
                  {o.break_start_time ? `, break ${o.break_start_time} (${o.break_duration}min)` : ""}
                </td>
                <td><span className={"badge " + (o.is_active ? "badge-success" : "badge-danger")}>{o.is_active ? "Active" : "Inactive"}</span></td>
                {canManage && (
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(o)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: "#dc2626" }} onClick={() => handleDelete(o.id)}>Remove</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AttendanceConfigTab({ onSaved, canManage, isGlobalLocked }) {
  const [marker,  setMarker]  = useState("incharge_only");
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    settingsApi.getByCategory("attendance_config").then(r => {
      const d = r.data.data || {};
      setMarker(d.attendance_marker || "incharge_only");
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.saveByCategory("attendance_config", { attendance_marker: marker });
      onSaved();
    } catch {}
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div className="section-card">
      <div className="section-card-header">
        <span className="section-card-title">Attendance Configuration</span>
      </div>
      {isGlobalLocked && (
        <div className="alert" style={{ background:"#fffbeb", border:"1px solid #fde68a", color:"#92400e", marginBottom:16 }}>
          Attendance Configuration is managed centrally by the superadmin. This section is read-only here.
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:500 }}>
        <div className="form-group">
          <label className="form-label">Who can mark attendance?</label>
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:8 }}>
            <label style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 14px", border:"1px solid "+(marker==="incharge_only"?"#2563eb":"#e2e8f0"), borderRadius:8, cursor:"pointer", background:marker==="incharge_only"?"#eff6ff":"#fff" }}>
              <input type="radio" name="marker" value="incharge_only" checked={marker==="incharge_only"} onChange={e=>setMarker(e.target.value)} style={{ marginTop:2 }} />
              <div>
                <div style={{ fontWeight:600, fontSize:13, color:marker==="incharge_only"?"#1d4ed8":"#1e3a5f" }}>Class Incharge Only</div>
                <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>Only the class incharge teacher can mark daily attendance for their class. Subject teachers cannot mark attendance.</div>
              </div>
            </label>
            <label style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 14px", border:"1px solid "+(marker==="all_teachers"?"#2563eb":"#e2e8f0"), borderRadius:8, cursor:"pointer", background:marker==="all_teachers"?"#eff6ff":"#fff" }}>
              <input type="radio" name="marker" value="all_teachers" checked={marker==="all_teachers"} onChange={e=>setMarker(e.target.value)} style={{ marginTop:2 }} />
              <div>
                <div style={{ fontWeight:600, fontSize:13, color:marker==="all_teachers"?"#1d4ed8":"#1e3a5f" }}>All Subject Teachers</div>
                <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>All teachers assigned to a class can mark attendance for their subject periods.</div>
              </div>
            </label>
          </div>
        </div>
        {canManage && (
          <button className="btn btn-primary" style={{ alignSelf:"flex-start" }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        )}
      </div>
    </div>
  );
}
function AccountSettingsTab({ onSaved, canManage }) {
  const [form,    setForm]    = useState({ idle_timeout_minutes:"15", max_failed_attempts:"5", lockout_duration_minutes:"15" });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [processingDate, setProcessingDate] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceMsg, setAdvanceMsg] = useState("");
  const [timeMode, setTimeMode] = useState("auto");
  const [liveTime, setLiveTime] = useState(null);
  const [manualTimeInput, setManualTimeInput] = useState("");
  const [settingTime, setSettingTime] = useState(false);
  const [timeMsg, setTimeMsg] = useState("");
  const anchorRef = useRef(null);
  const [schoolTimezone, setSchoolTimezone] = useState("UTC");

  const loadProcessingDate = () => {
    processingDateApi.get().then(r => setProcessingDate(r.data.data)).catch(() => {});
  };

  const loadProcessingTime = () => {
    processingDateApi.getTime().then(r => {
      const d = r.data.data;
      setTimeMode(d.mode);
      anchorRef.current = { serverTime: new Date(d.current_time), clientTime: Date.now() };
      setLiveTime(new Date(d.current_time));
    }).catch(() => {});
  };

  useEffect(() => {
    settingsApi.getByCategory("regional_format").then(r => {
      if (r.data.data?.timezone) setSchoolTimezone(r.data.data.timezone);
    }).catch(() => {});
    loadProcessingDate();
    loadProcessingTime();
    const interval = setInterval(() => {
      if (anchorRef.current) {
        const elapsed = Date.now() - anchorRef.current.clientTime;
        setLiveTime(new Date(anchorRef.current.serverTime.getTime() + elapsed));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSetAutomatic = async () => {
    setSettingTime(true); setTimeMsg("");
    try {
      await processingDateApi.setAutomatic();
      setTimeMsg("Processing time set to automatic.");
      loadProcessingTime();
    } catch {
      setTimeMsg("Failed to update.");
    } finally { setSettingTime(false); }
  };

  const handleSetManualTime = async () => {
    if (!manualTimeInput) return;
    setSettingTime(true); setTimeMsg("");
    try {
      const todayStr = liveTime
        ? new Intl.DateTimeFormat("en-CA", { timeZone: schoolTimezone }).format(liveTime)
        : new Intl.DateTimeFormat("en-CA", { timeZone: schoolTimezone }).format(new Date());
      const isoTime = `${todayStr}T${manualTimeInput}:00`;
      await processingDateApi.setManualTime({ new_time: isoTime });
      setTimeMsg("Manual processing time set.");
      loadProcessingTime();
    } catch {
      setTimeMsg("Failed to set manual time.");
    } finally { setSettingTime(false); }
  };

  const handleAdvance = async () => {
    if (!window.confirm("Advance the processing date to the next day? This affects all date-based calculations system-wide.")) return;
    setAdvancing(true); setAdvanceMsg("");
    try {
      const r = await processingDateApi.advance();
      setProcessingDate(r.data.data);
      setAdvanceMsg("Processing date advanced.");
    } catch {
      setAdvanceMsg("Failed to advance processing date.");
    } finally {
      setAdvancing(false);
    }
  };

  useEffect(() => {
    settingsApi.getByCategory("security")
      .then(r => setForm(prev => ({ ...prev, ...r.data.data })))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await settingsApi.saveByCategory("security", form);
      onSaved();
    } catch {
      setError("Failed to save account settings.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Current Processing Date</span>
        </div>
        <div style={{ padding:"12px 0" }}>
          {advanceMsg && <div style={{ fontSize:13, marginBottom:10, color:advanceMsg.includes("Failed")?"#dc2626":"#166534" }}>{advanceMsg}</div>}
          <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontSize:12, color:"#64748b" }}>Current Processing Date</div>
              <div style={{ fontSize:20, fontWeight:700 }}>{processingDate?.current_processing_date || "-"}</div>
            </div>
            {processingDate?.previous_processing_date && (
              <div>
                <div style={{ fontSize:12, color:"#64748b" }}>Previous</div>
                <div style={{ fontSize:14 }}>{processingDate.previous_processing_date}</div>
              </div>
            )}
            {canManage && (
              <button className="btn btn-primary btn-sm" style={{ color:"#fff", marginLeft:"auto" }} disabled={advancing} onClick={handleAdvance}>
                {advancing ? "Advancing..." : "Advance to Next Day"}
              </button>
            )}
          </div>
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:8 }}>
            This date drives all system-wide calculations (fee generation, overdue checks, notice periods, etc.) instead of the server clock.
            It advances automatically every midnight; use this button only for manual/testing overrides.
          </div>
        </div>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Current Processing Time</span>
        </div>
        <div style={{ padding:"12px 0" }}>
          {timeMsg && <div style={{ fontSize:13, marginBottom:10, color:timeMsg.includes("Failed")?"#dc2626":"#166534" }}>{timeMsg}</div>}
          <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap", marginBottom:12 }}>
            <div style={{ fontFamily:"monospace", fontSize:28, fontWeight:700, letterSpacing:1 }}>
              {liveTime ? liveTime.toLocaleTimeString("en-US", { timeZone: schoolTimezone }) : "--:--:--"}
            </div>
            <div style={{ fontSize:11, color:"#94a3b8" }}>({schoolTimezone})</div>
            <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:12,
              background: timeMode === "auto" ? "#eff6ff" : "#fff7ed", color: timeMode === "auto" ? "#1d4ed8" : "#c2410c" }}>
              {timeMode === "auto" ? "Automatic" : "Manual"}
            </span>
          </div>
          {canManage && (
            <div style={{ display:"flex", alignItems:"flex-end", gap:10, flexWrap:"wrap" }}>
              <button className="btn btn-ghost btn-sm" disabled={settingTime || timeMode === "auto"} onClick={handleSetAutomatic}>
                Set Time Automatically
              </button>
              <div>
                <label style={{ fontSize:11, fontWeight:600, display:"block", marginBottom:3 }}>Update Manual Time</label>
                <input type="time" className="form-control" style={{ width:140 }} value={manualTimeInput} onChange={e => setManualTimeInput(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm" style={{ color:"#fff" }} disabled={settingTime || !manualTimeInput} onClick={handleSetManualTime}>
                {settingTime ? "Updating..." : "Update Manual Time"}
              </button>
            </div>
          )}
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:8 }}>
            When set manually, the clock keeps ticking forward from the time you set, rather than following the real server clock.
          </div>
        </div>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Session &amp; Security</span>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Idle Timeout (minutes)</label>
            <input className="form-control" type="number" min="1" value={form.idle_timeout_minutes} onChange={e => setForm({...form, idle_timeout_minutes:e.target.value})} disabled={!canManage} />
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>How long a user can be inactive before the screen locks and asks for their password again.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Max Failed Login Attempts</label>
            <input className="form-control" type="number" min="1" value={form.max_failed_attempts} onChange={e => setForm({...form, max_failed_attempts:e.target.value})} disabled={!canManage} />
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>Number of incorrect password attempts (login or screen unlock) before the account is temporarily locked.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Lockout Duration (minutes)</label>
            <input className="form-control" type="number" min="1" value={form.lockout_duration_minutes} onChange={e => setForm({...form, lockout_duration_minutes:e.target.value})} disabled={!canManage} />
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>How long the account stays locked after too many failed attempts.</div>
          </div>
        </div>
        {canManage && (
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Account Settings"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TIMEZONES = (typeof Intl.supportedValuesOf === "function")
  ? Intl.supportedValuesOf("timeZone")
  : ["Asia/Karachi","UTC","America/New_York","Europe/London"];

const COUNTRY_CODES = [
  "PK","IN","BD","AF","LK","NP","SA","AE","QA","KW","BH","OM","EG","US","GB","CA","AU","NZ",
  "FR","DE","IT","ES","NL","BE","CH","SE","NO","DK","FI","IE","PT","PL","RU","CN","JP","KR",
  "SG","MY","ID","TH","PH","VN","TR","IR","IQ","JO","LB","YE","NG","KE","ZA","GH","ET","MA",
  "DZ","TN","LY","BR","MX","AR","CL","CO","PE",
];

function getCountryName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code);
  } catch { return code; }
}

function getTimezoneOffset(tz) {
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const part = parts.find(p => p.type === "timeZoneName");
    return part ? part.value : "";
  } catch { return ""; }
}

const CURRENCY_SYMBOL_OVERRIDES = {
  PKR: "Rs", INR: "\u20b9", SAR: "SR", AED: "AED", BDT: "\u09f3", AFN: "Af",
  NPR: "Rs", LKR: "Rs", EGP: "E\u00a3", QAR: "QR", KWD: "KD", BHD: "BD", OMR: "OMR",
  IDR: "Rp", MYR: "RM", THB: "\u0e3f", PHP: "\u20b1", VND: "\u20ab", TRY: "\u20ba",
  ZAR: "R", NGN: "\u20a6", KES: "KSh", CNY: "\u00a5", JPY: "\u00a5",
};

function getCurrencySymbol(code) {
  if (CURRENCY_SYMBOL_OVERRIDES[code]) return CURRENCY_SYMBOL_OVERRIDES[code];
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency: code }).formatToParts(0);
    const part = parts.find(p => p.type === "currency");
    return part ? part.value : code;
  } catch { return code; }
}

const CURRENCIES = (typeof Intl.supportedValuesOf === "function")
  ? Intl.supportedValuesOf("currency").map(code => ({ code, symbol: getCurrencySymbol(code) }))
  : [{ code:"PKR", symbol:"Rs" }, { code:"USD", symbol:"$" }];

function RegionalFormatTab({ onSaved, canManage }) {
  const [form, setForm] = useState({
    date_format: "DD/MM/YYYY", time_format: "24h", decimal_places: "2", region: "en-PK", country: "PK",
    currency_code: "PKR", currency_symbol: "Rs", currency_position: "prefix",
    timezone: "Asia/Karachi", weekend_days: "Saturday,Sunday", first_day_of_week: "Monday",
    academic_year_start_month: "4", fiscal_year_start_month: "7", default_country_code: "+92",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    settingsApi.getByCategory("regional_format")
      .then(r => setForm(prev => ({ ...prev, ...r.data.data })))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleWeekendDay = (day) => {
    setForm(f => {
      const days = f.weekend_days ? f.weekend_days.split(",").filter(Boolean) : [];
      const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
      return { ...f, weekend_days: next.join(",") };
    });
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await settingsApi.saveByCategory("regional_format", form);
      onSaved();
    } catch {
      setError("Failed to save regional & format settings.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="loading-state">Loading...</div>;

  const weekendDaysArr = form.weekend_days ? form.weekend_days.split(",").filter(Boolean) : [];

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Date &amp; Time</span>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Date Format</label>
            <select className="form-control" value={form.date_format} onChange={e => setForm({...form, date_format:e.target.value})} disabled={!canManage}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="DD-MM-YYYY">DD-MM-YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD MMM YYYY">DD MMM YYYY (04 Aug 2026)</option>
              <option value="MMM DD, YYYY">MMM DD, YYYY (Aug 04, 2026)</option>
              <option value="DD MMMM YYYY">DD MMMM YYYY (04 August 2026)</option>
              <option value="MMMM DD, YYYY">MMMM DD, YYYY (August 04, 2026)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Time Format</label>
            <select className="form-control" value={form.time_format} onChange={e => setForm({...form, time_format:e.target.value})} disabled={!canManage}>
              <option value="24h">24-hour</option>
              <option value="12h">12-hour (AM/PM)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Timezone</label>
            <select className="form-control" value={form.timezone} onChange={e => setForm({...form, timezone:e.target.value})} disabled={!canManage}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz} ({getTimezoneOffset(tz)})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">First Day of Week</label>
            <select className="form-control" value={form.first_day_of_week} onChange={e => setForm({...form, first_day_of_week:e.target.value})} disabled={!canManage}>
              {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Weekend Days</span>
        </div>
        <div style={{ display:"flex", gap:14, flexWrap:"wrap", padding:"8px 0" }}>
          {WEEKDAYS.map(d => (
            <label key={d} style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:canManage?"pointer":"default" }}>
              <input type="checkbox" checked={weekendDaysArr.includes(d)} onChange={() => toggleWeekendDay(d)} disabled={!canManage} />
              {d}
            </label>
          ))}
        </div>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Currency &amp; Numbers</span>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Currency Code</label>
            <select className="form-control" value={form.currency_code} onChange={e => {
              const match = CURRENCIES.find(c => c.code === e.target.value);
              setForm({...form, currency_code:e.target.value, currency_symbol: match ? match.symbol : form.currency_symbol});
            }} disabled={!canManage}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Currency Symbol</label>
            <input className="form-control" value={form.currency_symbol} disabled style={{background:"#f1f5f9",color:"#64748b"}} />
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>Auto-set from the Currency Code above.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Symbol Position</label>
            <select className="form-control" value={form.currency_position} onChange={e => setForm({...form, currency_position:e.target.value})} disabled={!canManage}>
              <option value="prefix">Before amount (Rs 500)</option>
              <option value="suffix">After amount (500 Rs)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Decimal Places</label>
            <input className="form-control" type="number" min="0" max="4" value={form.decimal_places} onChange={e => setForm({...form, decimal_places:e.target.value})} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label className="form-label">Country</label>
            <select className="form-control" value={form.country || "PK"} onChange={e => setForm({...form, country:e.target.value, region:`en-${e.target.value}`})} disabled={!canManage}>
              {COUNTRY_CODES.map(code => <option key={code} value={code}>{getCountryName(code)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Region (number formatting)</label>
            <input className="form-control" value={form.region} disabled style={{background:"#f1f5f9",color:"#64748b"}} />
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>Auto-set from the Country above.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Default Phone Country Code</label>
            <input className="form-control" value={form.default_country_code} onChange={e => setForm({...form, default_country_code:e.target.value})} disabled={!canManage} placeholder="e.g. +92" />
          </div>
        </div>
      </div>

      <div className="section-card" style={{ marginBottom:16 }}>
        <div className="section-card-header">
          <span className="section-card-title">Academic &amp; Fiscal Year</span>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Academic Year Start Month</label>
            <select className="form-control" value={form.academic_year_start_month} onChange={e => setForm({...form, academic_year_start_month:e.target.value})} disabled={!canManage}>
              {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Fiscal Year Start Month</label>
            <select className="form-control" value={form.fiscal_year_start_month} onChange={e => setForm({...form, fiscal_year_start_month:e.target.value})} disabled={!canManage}>
              {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {canManage && (
        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Regional & Format Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
