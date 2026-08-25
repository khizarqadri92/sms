import React, { useState, useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import libraryApi from "../api/libraryApi";
import DatePicker from "../components/DatePicker";

function BarcodeCanvas({ value }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (canvasRef.current && value) {
      try {
        JsBarcode(canvasRef.current, value, { format: "CODE128", displayValue: false, height: 40, width: 1.5, margin: 4 });
      } catch (e) {}
    }
  }, [value]);
  return <canvas ref={canvasRef} />;
}

function PrintLabelsModal({ book, onClose }) {
  const [copies, setCopies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    libraryApi.getBook(book.id).then(r => setCopies(r.data.data.copies || [])).catch(() => {}).finally(() => setLoading(false));
  }, [book.id]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} className="no-print-overlay">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-labels-area, .print-labels-area * { visibility: visible; }
          .print-labels-area { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 700, maxHeight: "88vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Print Labels — {book.title}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" style={{ background: "#2563eb", color: "#ffffff", border: "none" }} onClick={() => window.print()}>Print</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading copies...</div>
        ) : (
          <div className="print-labels-area" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {copies.map(c => (
              <div key={c.id} style={{ border: "1px dashed #cbd5e1", borderRadius: 6, padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, minHeight: 28 }}>{book.title}</div>
                <BarcodeCanvas value={c.barcode} />
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{c.accession_no}</div>
                <div style={{ fontSize: 9, color: "#94a3b8" }}>{book.shelf || "-"} / {book.rack || "-"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookFormModal({ onClose, onSaved, categories, authors, publishers, editBook }) {
  const [form, setForm] = useState({
    isbn: editBook?.isbn || "",
    title: editBook?.title || "",
    subtitle: editBook?.subtitle || "",
    author_id: editBook?.author_id || "",
    publisher_id: editBook?.publisher_id || "",
    category_id: editBook?.category_id || "",
    edition: editBook?.edition || "",
    publication_year: editBook?.publication_year || "",
    language: editBook?.language || "English",
    shelf: editBook?.shelf || "",
    rack: editBook?.rack || "",
    description: editBook?.description || "",
    num_copies: 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) { setError("Title is required."); return; }
    setSaving(true); setError("");
    try {
      if (editBook) {
        await libraryApi.updateBook(editBook.id, form);
      } else {
        await libraryApi.createBook(form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save book.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{editBook ? "Edit Book" : "Add New Book"}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group form-grid-full">
              <label className="form-label">Title *</label>
              <input className="form-control" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Subtitle</label>
              <input className="form-control" value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">ISBN</label>
              <input className="form-control" value={form.isbn} onChange={e => setForm({ ...form, isbn: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Author</label>
              <select className="form-control" value={form.author_id} onChange={e => setForm({ ...form, author_id: e.target.value })}>
                <option value="">Select author</option>
                {authors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Publisher</label>
              <select className="form-control" value={form.publisher_id} onChange={e => setForm({ ...form, publisher_id: e.target.value })}>
                <option value="">Select publisher</option>
                {publishers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Edition</label>
              <input className="form-control" value={form.edition} onChange={e => setForm({ ...form, edition: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Publication Year</label>
              <input className="form-control" type="number" value={form.publication_year} onChange={e => setForm({ ...form, publication_year: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Language</label>
              <input className="form-control" value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Shelf</label>
              <input className="form-control" value={form.shelf} onChange={e => setForm({ ...form, shelf: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Rack</label>
              <input className="form-control" value={form.rack} onChange={e => setForm({ ...form, rack: e.target.value })} />
            </div>
            {!editBook && (
              <div className="form-group">
                <label className="form-label">Number of Copies</label>
                <input className="form-control" type="number" min="1" value={form.num_copies} onChange={e => setForm({ ...form, num_copies: e.target.value })} />
              </div>
            )}
            <div className="form-group form-grid-full">
              <label className="form-label">Description</label>
              <textarea className="form-control" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : editBook ? "Update Book" : "Add Book"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuickAddModal({ kind, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "", nationality: "", date_of_birth: "", bio: "",
    address: "", contact_person: "", phone: "", email: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const labels = { category: "Category", author: "Author", publisher: "Publisher" };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      if (kind === "category") {
        await libraryApi.createCategory({ name: form.name });
      } else if (kind === "author") {
        await libraryApi.createAuthor({
          name: form.name,
          nationality: form.nationality || null,
          date_of_birth: form.date_of_birth || null,
          bio: form.bio || null,
        });
      } else if (kind === "publisher") {
        await libraryApi.createPublisher({
          name: form.name,
          address: form.address || null,
          contact_person: form.contact_person || null,
          phone: form.phone || null,
          email: form.email || null,
        });
      }
      onSaved();
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420, maxHeight: "85vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Add {labels[kind]}</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>

          {kind === "author" && (
            <>
              <div className="form-group">
                <label className="form-label">Nationality</label>
                <input className="form-control" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <DatePicker value={form.date_of_birth} onChange={val => setForm({ ...form, date_of_birth: val })} />
              </div>
              <div className="form-group">
                <label className="form-label">Biography</label>
                <textarea className="form-control" rows={3} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} />
              </div>
            </>
          )}

          {kind === "publisher" && (
            <>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Person</label>
                <input className="form-control" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-control" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddCopiesModal({ book, onClose, onSaved }) {
  const [numCopies, setNumCopies] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await libraryApi.addCopies(book.id, { num_copies: numCopies });
      onSaved();
    } catch {
      setError("Failed to add copies.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Add Copies</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>{book.title}</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Number of Copies to Add</label>
            <input className="form-control" type="number" min="1" value={numCopies} onChange={e => setNumCopies(e.target.value)} autoFocus />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Adding..." : "Add Copies"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReserveModal({ book, onClose, onSaved }) {
  const [query, setQuery] = useState("");
  const [memberType, setMemberType] = useState("student");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [reservingId, setReservingId] = useState(null);
  const [error, setError] = useState("");

  const runSearch = () => {
    setSearching(true); setError("");
    libraryApi.getMembers({ search: query, member_type: memberType })
      .then(r => setResults(r.data.data || []))
      .catch(() => setError("Search failed."))
      .finally(() => setSearching(false));
  };

  useEffect(() => { runSearch(); }, [memberType]);

  const handleReserve = async (member) => {
    setReservingId(member.member_id);
    setError("");
    try {
      await libraryApi.placeReservation({ book_id: book.id, member_id: member.member_id });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to place reservation.");
    } finally {
      setReservingId(null);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 480, maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Reserve Book</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>{book.title} — currently unavailable</div>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <select className="form-control" style={{ maxWidth: 130 }} value={memberType} onChange={e => setMemberType(e.target.value)}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="staff">Staff</option>
          </select>
          <input className="form-control" placeholder="Search member" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} />
          <button className="btn btn-secondary btn-sm" onClick={runSearch}>Go</button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ overflow: "auto", flex: 1 }}>
          {searching ? (
            <div className="loading-state">Searching...</div>
          ) : results.length === 0 ? (
            <div className="empty-state">No matching members found.</div>
          ) : (
            results.map(m => (
              <div key={m.member_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontSize: 13 }}>{m.first_name} {m.last_name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.library_card_no}</div>
                </div>
                <button className="btn btn-primary btn-xs" disabled={reservingId === m.member_id} onClick={() => handleReserve(m)}>
                  {reservingId === m.member_id ? "Reserving..." : "Reserve"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BookDetailModal({ bookId, onClose }) {
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    libraryApi.getBook(bookId).then(r => setBook(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, [bookId]);

  const conditionBadge = { excellent: "badge-success", good: "badge-primary", damaged: "badge-warning", lost: "badge-danger" };
  const statusBadge = { available: "badge-success", issued: "badge-primary", lost: "badge-danger", damaged: "badge-warning", removed: "badge-gray" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 600, maxHeight: "85vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Book Copies</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        {loading ? <div className="loading-state">Loading...</div> : book && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{book.title}</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>{book.author_name || "Unknown author"} · {book.category_name || "Uncategorized"}</div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Accession No.</th>
                  <th>Barcode</th>
                  <th>Condition</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {book.copies.map(c => (
                  <tr key={c.id}>
                    <td>{c.accession_no}</td>
                    <td>{c.barcode}</td>
                    <td><span className={"badge " + (conditionBadge[c.condition] || "badge-gray")} style={{ textTransform: "capitalize" }}>{c.condition}</span></td>
                    <td><span className={"badge " + (statusBadge[c.status] || "badge-gray")} style={{ textTransform: "capitalize" }}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

export default function LibraryCatalog() {
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [publishers, setPublishers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filters, setFilters] = useState({ search: "", category_id: "", author_id: "", availability: "" });
  const [showBookForm, setShowBookForm] = useState(false);
  const [editBook, setEditBook] = useState(null);
  const [quickAdd, setQuickAdd] = useState(null);
  const [copiesModalBook, setCopiesModalBook] = useState(null);
  const [detailBookId, setDetailBookId] = useState(null);
  const [reserveBook, setReserveBook] = useState(null);
  const [printBook, setPrintBook] = useState(null);

  const fetchLookups = () => {
    libraryApi.getCategories().then(r => setCategories(r.data.data || [])).catch(() => {});
    libraryApi.getAuthors().then(r => setAuthors(r.data.data || [])).catch(() => {});
    libraryApi.getPublishers().then(r => setPublishers(r.data.data || [])).catch(() => {});
  };

  const fetchBooks = (activeFilters) => {
    setLoading(true); setError("");
    const params = {};
    Object.entries(activeFilters || filters).forEach(([k, v]) => { if (v) params[k] = v; });
    libraryApi.getBooks(params)
      .then(r => setBooks(r.data.data || []))
      .catch(() => setError("Failed to load books."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLookups();
    fetchBooks();
  }, []);

  const applyFilters = () => fetchBooks();
  const clearFilters = () => {
    const empty = { search: "", category_id: "", author_id: "", availability: "" };
    setFilters(empty);
    fetchBooks(empty);
  };

  const showToast = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleDeactivate = async (book) => {
    if (!window.confirm(`Remove "${book.title}" from the catalog?`)) return;
    try {
      await libraryApi.deactivateBook(book.id);
      showToast("Book removed from catalog.");
      fetchBooks();
    } catch {
      setError("Failed to remove book.");
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-heading">Library Catalog</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setQuickAdd("category")}>+ Category</button>
          <button className="btn btn-secondary" onClick={() => setQuickAdd("author")}>+ Author</button>
          <button className="btn btn-secondary" onClick={() => setQuickAdd("publisher")}>+ Publisher</button>
          <button className="btn btn-primary" onClick={() => { setEditBook(null); setShowBookForm(true); }}>+ Add Book</button>
        </div>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="section-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <label className="form-label">Search</label>
            <input className="form-control" placeholder="Title, ISBN, or author" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} onKeyDown={e => e.key === "Enter" && applyFilters()} />
          </div>
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label className="form-label">Category</label>
            <select className="form-control" value={filters.category_id} onChange={e => setFilters({ ...filters, category_id: e.target.value })}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
            <label className="form-label">Author</label>
            <select className="form-control" value={filters.author_id} onChange={e => setFilters({ ...filters, author_id: e.target.value })}>
              <option value="">All Authors</option>
              {authors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
            <label className="form-label">Availability</label>
            <select className="form-control" value={filters.availability} onChange={e => setFilters({ ...filters, availability: e.target.value })}>
              <option value="">Any</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>
          <button className="btn btn-secondary" onClick={clearFilters}>Clear</button>
          <button className="btn btn-primary" onClick={applyFilters}>Filter</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading catalog...</div>
      ) : books.length === 0 ? (
        <div className="empty-state">No books found. Add one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Author</th>
                <th>Category</th>
                <th>Shelf / Rack</th>
                <th>Copies</th>
                <th>Available</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {books.map(b => (
                <tr key={b.id}>
                  <td>
                    <strong style={{ cursor: "pointer", color: "#2563eb" }} onClick={() => setDetailBookId(b.id)}>{b.title}</strong>
                    {b.subtitle && <div style={{ fontSize: 11, color: "#94a3b8" }}>{b.subtitle}</div>}
                  </td>
                  <td>{b.author_name || <span style={{ color: "#94a3b8" }}>Unknown</span>}</td>
                  <td>{b.category_name || <span style={{ color: "#94a3b8" }}>Uncategorized</span>}</td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>{b.shelf || "-"} / {b.rack || "-"}</td>
                  <td>{b.total_copies}</td>
                  <td>
                    <span className={"badge " + (b.available_copies > 0 ? "badge-success" : "badge-danger")}>
                      {b.available_copies} / {b.total_copies}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => { setEditBook(b); setShowBookForm(true); }}>Edit</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setCopiesModalBook(b)}>+ Copies</button>
                    {b.available_copies === 0 && (
                      <button className="btn btn-secondary btn-xs" onClick={() => setReserveBook(b)}>Reserve</button>
                    )}
                    <button className="btn btn-secondary btn-xs" onClick={() => setPrintBook(b)}>Print Labels</button>
                    <button className="btn btn-danger btn-xs" onClick={() => handleDeactivate(b)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showBookForm && (
        <BookFormModal
          editBook={editBook}
          categories={categories}
          authors={authors}
          publishers={publishers}
          onClose={() => setShowBookForm(false)}
          onSaved={() => { setShowBookForm(false); showToast(editBook ? "Book updated." : "Book added."); fetchBooks(); }}
        />
      )}

      {quickAdd && (
        <QuickAddModal
          kind={quickAdd}
          onClose={() => setQuickAdd(null)}
          onSaved={() => { setQuickAdd(null); showToast("Added."); fetchLookups(); }}
        />
      )}

      {copiesModalBook && (
        <AddCopiesModal
          book={copiesModalBook}
          onClose={() => setCopiesModalBook(null)}
          onSaved={() => { setCopiesModalBook(null); showToast("Copies added."); fetchBooks(); }}
        />
      )}

      {detailBookId && (
        <BookDetailModal bookId={detailBookId} onClose={() => setDetailBookId(null)} />
      )}

      {reserveBook && (
        <ReserveModal
          book={reserveBook}
          onClose={() => setReserveBook(null)}
          onSaved={() => { setReserveBook(null); showToast("Reservation placed."); }}
        />
      )}

      {printBook && (
        <PrintLabelsModal book={printBook} onClose={() => setPrintBook(null)} />
      )}
    </div>
  );
}
