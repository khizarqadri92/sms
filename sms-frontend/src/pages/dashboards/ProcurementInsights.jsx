import { useState, useEffect, useCallback } from "react";
import { ResponsiveContainer, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { dashboardsApi } from "../../api/dashboardsApi";
import { useChartTheme, axis, ThemedTooltip, ChartCard, StatTile, EmptyChart, HeroBanner, fmtDay } from "../../components/dashboard/ChartKit";

const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "short" }) + " " + y.slice(2); };
const k = (v) => v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? Math.round(v / 1000) + "k" : v;
const rs = (n) => "Rs. " + Number(n || 0).toLocaleString();

/** Procurement: requisitions & POs by status, PO value, vendor spend, department demand, low stock. */
export default function ProcurementInsights() {
  const t = useChartTheme();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await dashboardsApi.procurement(); setD(r.data.data); }
    catch (e) { setError(e?.response?.data?.message || "Could not load the charts."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <div className="dk-wrap"><EmptyChart text={error} /></div>;
  if (!d) return <div className="dk-wrap"><EmptyChart text="Loading charts..." /></div>;
  const tl = d.tiles;
  const donut = (rows, key) => (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={rows} dataKey={key} nameKey="status" innerRadius="50%" outerRadius="78%" paddingAngle={2}>
          {rows.map((r, i) => <Cell key={r.status} fill={t.series[i % t.series.length]} stroke="none" />)}
        </Pie>
        <ThemedTooltip t={t} />
        <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
      </PieChart>
    </ResponsiveContainer>
  );

  return (
    <div className="dk-wrap">
      <HeroBanner today={d.today} onRefresh={load} loading={loading}
        alert={tl.low_stock ? { tone: "bad", text: tl.low_stock + " item" + (tl.low_stock > 1 ? "s are" : " is") + " below minimum stock" + (d.low_stock[0] ? " - " + d.low_stock[0].item + " has " + d.low_stock[0].stock + " left" : "") }
      : tl.open_requisitions ? { tone: "warn", text: tl.open_requisitions + " requisition" + (tl.open_requisitions > 1 ? "s are" : " is") + " waiting to be processed" }
      : { tone: "ok", text: "Stock is healthy and no requisitions are waiting." }}
        highlights={[
      { label: "Open requisitions", value: tl.open_requisitions },
      { label: "Open purchase orders", value: tl.open_pos },
      { label: "PO value this month", value: rs(tl.po_value_this_month) },
    ]} />
      <div className="dk-tiles">
        <StatTile label="Open requisitions" value={tl.open_requisitions} tone={tl.open_requisitions ? "warn" : "ok"} sub="Not yet approved or converted" />
        <StatTile label="Open purchase orders" value={tl.open_pos} sub="Not yet completed" />
        <StatTile label="PO value this month" value={rs(tl.po_value_this_month)} />
        <StatTile label="Items below minimum stock" value={tl.low_stock} tone={tl.low_stock ? "bad" : "ok"} />
      </div>
      <div className="dk-grid">
        <ChartCard title="Purchase order value" subtitle="Last 12 months · line = number of orders" span={2}>
          {d.po_value.some(m => m.value) ? (
            <ResponsiveContainer>
              <ComposedChart data={d.po_value} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis(t)} minTickGap={8} />
                <YAxis yAxisId="v" tickFormatter={k} {...axis(t)} />
                <YAxis yAxisId="n" orientation="right" allowDecimals={false} {...axis(t)} />
                <ThemedTooltip t={t} labelFormatter={monthLabel} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />
                <Bar yAxisId="v" dataKey="value" name="PO value (Rs.)" fill={t.main} radius={[4, 4, 0, 0]} />
                <Line yAxisId="n" type="monotone" dataKey="orders" name="Orders" stroke={t.comp} strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No purchase orders in the last 12 months." />}
        </ChartCard>
        <ChartCard title="Requisitions by status">
          {d.requisitions.length ? donut(d.requisitions, "count") : <EmptyChart text="No requisitions yet." />}
        </ChartCard>
        <ChartCard title="Purchase orders by status">
          {d.purchase_orders.length ? donut(d.purchase_orders, "count") : <EmptyChart text="No purchase orders yet." />}
        </ChartCard>
        <ChartCard title="Spending by vendor" subtitle="Last 12 months">
          {d.vendors.length ? (
            <ResponsiveContainer>
              <BarChart data={d.vendors} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={k} {...axis(t)} />
                <YAxis type="category" dataKey="vendor" width={110} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Bar dataKey="amount" name="Spent (Rs.)" fill={t.main} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No vendor spending in the last 12 months." />}
        </ChartCard>
        <ChartCard title="Requests by department" subtitle="Estimated value · last 12 months">
          {d.by_department.length ? (
            <ResponsiveContainer>
              <BarChart data={d.by_department} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={t.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={k} {...axis(t)} />
                <YAxis type="category" dataKey="dept" width={110} {...axis(t)} />
                <ThemedTooltip t={t} />
                <Bar dataKey="amount" name="Estimated (Rs.)" fill={t.series[4]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart text="No requisitions in the last 12 months." />}
        </ChartCard>
        <div className="dk-card">
          <div className="dk-card-head"><div><div className="dk-card-title">Low stock</div>
            <div className="dk-card-sub">Items below their minimum level</div></div></div>
          {d.low_stock.length ? (
            <div className="dk-table-wrap">
              <table className="dk-table">
                <thead><tr><th>Item</th><th>In stock</th><th>Minimum</th></tr></thead>
                <tbody>{d.low_stock.map(x => (
                  <tr key={x.item}><td><b>{x.item}</b></td><td><span className="dk-chip">{x.stock} {x.unit || ""}</span></td><td>{x.min} {x.unit || ""}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyChart text="Everything is above minimum stock." />}
        </div>
      </div>
    </div>
  );
}
