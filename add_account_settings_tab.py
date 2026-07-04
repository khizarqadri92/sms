path = r"J:\sms-project\sms-frontend\src\pages\Settings.jsx"
with open(path, "rb") as f:
    raw = f.read()
if raw.startswith(b"\xef\xbb\xbf"):
    raw = raw[3:]

def apply_edit(raw, old, new, label):
    candidates = [old, old.replace(b"\n", b"\r\n")]
    for c in candidates:
        if raw.count(c) == 1:
            n = new if c == old else new.replace(b"\n", b"\r\n")
            print(label + " OK")
            return raw.replace(c, n)
    raise SystemExit(label + " FAILED. LF=" + str(raw.count(candidates[0])) + " CRLF=" + str(raw.count(candidates[1])))

# Edit 1: whitelist
old1 = b'["id_formats","school_info","fee_settings","school_timing","attendance_config"].includes(sub)'
new1 = b'["id_formats","school_info","fee_settings","school_timing","attendance_config","account_settings"].includes(sub)'
raw = apply_edit(raw, old1, new1, "Edit 1 (whitelist)")

# Edit 2: render conditional
old2 = b'''      {tab === "school_timing"  && <SchoolTimingTab  onSaved={() => showToast("School timing saved.")} canManage={can("settings.manage")} />}
    </div>
  );
}'''
new2 = b'''      {tab === "school_timing"  && <SchoolTimingTab  onSaved={() => showToast("School timing saved.")} canManage={can("settings.manage")} />}
      {tab === "account_settings" && <AccountSettingsTab onSaved={() => showToast("Account security settings saved.")} canManage={can("settings.manage")} />}
    </div>
  );
}'''
raw = apply_edit(raw, old2, new2, "Edit 2 (render conditional)")

# Edit 3: append the new AccountSettingsTab component at end of file
component = b'''

function AccountSettingsTab({ onSaved, canManage }) {
  const [form,    setForm]    = useState({ idle_timeout_minutes:"15", max_failed_attempts:"5", lockout_duration_minutes:"15" });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

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
'''
raw = raw.rstrip() + component.replace(b"\n", b"\r\n") if False else raw

# apply proper CRLF handling for appended component depending on file's dominant newline
newline = b"\r\n" if raw.count(b"\r\n") >= (raw.count(b"\n") - raw.count(b"\r\n")) else b"\n"
raw = raw.rstrip() + newline + component.replace(b"\n", newline).lstrip(newline)

with open(path, "wb") as f:
    f.write(raw)
print("WRITE COMPLETE - Settings.jsx: AccountSettingsTab added.")
