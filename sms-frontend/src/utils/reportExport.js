import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function printReport() {
  window.print();
}

export function exportToCSV(columns, rows, filename) {
  const header = columns.map(c => `"${c.label}"`).join(",");
  const lines = rows.map(row => columns.map(c => {
    const val = c.value(row);
    return `"${String(val ?? "").replace(/"/g, '""')}"`;
  }).join(","));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function exportToPDF(title, columns, rows, filename) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  autoTable(doc, {
    startY: 22,
    head: [columns.map(c => c.label)],
    body: rows.map(row => columns.map(c => String(c.value(row) ?? ""))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 76, 53] },
  });
  doc.save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}

export function ReportActions({ onPrint, onCSV, onPDF }) {
  return null;
}
