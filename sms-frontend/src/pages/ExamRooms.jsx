import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { examsApi } from "../api/examsApi";
import "./Datesheet.css";

const errMsg = (e, fb = "Failed.") => e?.response?.data?.detail?.message || e?.response?.data?.message || fb;

// Exam rooms for the current campus, with seating capacity.
// Used by the Datesheet (manual and auto) to allocate rooms and stop double-booking.
export default function ExamRooms() {
  const navigate = useNavigate();
  const [rooms, setRooms]       = useState([]);
  const [showOff, setShowOff]   = useState(false);
  const [newRoom, setNewRoom]   = useState({ name: "", capacity: "" });
  const [editId, setEditId]     = useState(null);
  const [editRoom, setEditRoom] = useState({ name: "", capacity: "" });
  const [flash, setFlash]       = useState({});
  const [busy, setBusy]         = useState(false);

  const notify = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash({}), 4000); };

  const load = async () => {
    try { const r = await examsApi.getRooms({ include_inactive: true }); setRooms(r.data.data || []); }
    catch (e) { notify("error", errMsg(e, "Failed to load rooms.")); }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newRoom.name.trim()) return notify("error", "Enter a room name.");
    if (!(Number(newRoom.capacity) > 0)) return notify("error", "Enter the number of seats.");
    setBusy(true);
    try {
      await examsApi.createRoom({ name: newRoom.name.trim(), capacity: Number(newRoom.capacity) });
      setNewRoom({ name: "", capacity: "" }); await load(); notify("success", "Room added.");
    } catch (e) { notify("error", errMsg(e)); }
    finally { setBusy(false); }
  };

  const save = async (room) => {
    if (!editRoom.name.trim() || !(Number(editRoom.capacity) > 0)) return notify("error", "Enter a name and the number of seats.");
    setBusy(true);
    try {
      await examsApi.updateRoom(room.id, { name: editRoom.name.trim(), capacity: Number(editRoom.capacity), is_active: room.is_active });
      setEditId(null); await load(); notify("success", "Room updated.");
    } catch (e) { notify("error", errMsg(e)); }
    finally { setBusy(false); }
  };

  const setActive = async (room, active) => {
    setBusy(true);
    try {
      if (active) await examsApi.updateRoom(room.id, { name: room.name, capacity: room.capacity, is_active: true });
      else await examsApi.deactivateRoom(room.id);
      await load(); notify("success", active ? "Room reactivated." : "Room deactivated.");
    } catch (e) { notify("error", errMsg(e)); }
    finally { setBusy(false); }
  };

  const shown = rooms.filter(r => showOff || r.is_active);
  const totalSeats = rooms.filter(r => r.is_active).reduce((n, r) => n + Number(r.capacity || 0), 0);

  return (
    <div className="ds-page">
      <div className="ds-header">
        <div className="ds-h1">Exam Rooms</div>
        <div className="ds-header-row">
          <div className="ds-sub">Rooms and seating capacity for this campus, used when building datesheets</div>
          <button className="ds-cancel-btn" onClick={() => navigate("/datesheet")}>&larr; Back to Datesheet</button>
        </div>
      </div>

      {flash.msg && <div className={"ds-flash ds-flash--" + (flash.type || "success")}>{flash.msg}</div>}

      <div className="ds-card">
        <div className="ds-card-hdr">
          <div>
            <div className="ds-card-title">Rooms</div>
            <div className="ds-grid-meta-text">{rooms.filter(r => r.is_active).length} active rooms &middot; {totalSeats} seats in total</div>
          </div>
          <label className="ds-check-inline">
            <input type="checkbox" checked={showOff} onChange={e => setShowOff(e.target.checked)} /> Show inactive
          </label>
        </div>

        <div className="ds-rooms-add">
          <div>
            <div className="ds-common-field-label">Room name *</div>
            <input className="ds-field-input" style={{ width: 220 }} placeholder="e.g. Room 4, Main Hall"
              value={newRoom.name} onChange={e => setNewRoom(r => ({ ...r, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && add()} />
          </div>
          <div>
            <div className="ds-common-field-label">Seats *</div>
            <input type="number" min="1" className="ds-field-input" style={{ width: 110 }} placeholder="e.g. 40"
              value={newRoom.capacity} onChange={e => setNewRoom(r => ({ ...r, capacity: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && add()} />
          </div>
          <button className="ds-save-btn" disabled={busy} onClick={add}>Add Room</button>
        </div>

        {shown.length === 0 ? (
          <div className="ds-rooms-empty">No rooms yet. Add the rooms used for exams, with how many students each can seat.</div>
        ) : (
          <table className="ds-rooms-table">
            <thead><tr><th>Room</th><th>Seats</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {shown.map(room => (
                <tr key={room.id} className={room.is_active ? "" : "ds-room-off"}>
                  {editId === room.id ? (<>
                    <td><input className="ds-field-input" value={editRoom.name} onChange={e => setEditRoom(r => ({ ...r, name: e.target.value }))} /></td>
                    <td><input type="number" min="1" className="ds-field-input" style={{ width: 100 }} value={editRoom.capacity} onChange={e => setEditRoom(r => ({ ...r, capacity: e.target.value }))} /></td>
                    <td>{room.is_active ? "Active" : "Inactive"}</td>
                    <td><div className="ds-room-actions">
                      <button className="ds-cancel-btn" onClick={() => setEditId(null)}>Cancel</button>
                      <button className="ds-save-btn" disabled={busy} onClick={() => save(room)}>Save</button>
                    </div></td>
                  </>) : (<>
                    <td><strong>{room.name}</strong></td>
                    <td>{room.capacity}</td>
                    <td>{room.is_active ? "Active" : "Inactive"}</td>
                    <td><div className="ds-room-actions">
                      <button className="ds-cancel-btn" onClick={() => { setEditId(room.id); setEditRoom({ name: room.name, capacity: room.capacity }); }}>Edit</button>
                      {room.is_active
                        ? <button className="ds-delete-btn" disabled={busy} onClick={() => setActive(room, false)}>Deactivate</button>
                        : <button className="ds-cancel-btn" disabled={busy} onClick={() => setActive(room, true)}>Reactivate</button>}
                    </div></td>
                  </>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
