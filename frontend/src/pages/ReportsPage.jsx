import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, peso, today, firstOfMonth } from '../utils/api.js';
import Banner from '../components/ui/Banner.jsx';

// ── Export helpers ────────────────────────────────────────────
async function exportPDF(title, headers, rows) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Jing-Jing Store — ' + title, 14, 22);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Generated: ' + new Date().toLocaleString('en-PH'), 14, 30);
  autoTable(doc, {
    startY: 36,
    head: [headers],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [201, 136, 12], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [253, 246, 224] },
  });
  doc.save(title.replace(/\s+/g, '_') + '.pdf');
  toast.success('PDF downloaded!');
}

async function exportExcel(title, headers, rows) {
  const XLSX = await import('xlsx');
  const ws   = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  XLSX.writeFile(wb, title.replace(/\s+/g, '_') + '.xlsx');
  toast.success('Excel downloaded!');
}

// ── Tab: Daily Sales ─────────────────────────────────────────
function DailyTab() {
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo,   setDateTo]   = useState(today());
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [banner,   setBanner]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setBanner(null);
    try {
      const q = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const r = await api.get('/reports/daily.php?' + q);
      setData(r.data);
    } catch (err) {
      setBanner({ type: 'error', msg: err.message });
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  const doExport = (type) => {
    const headers = ['Date', 'Transactions', 'Items Sold', 'Total Sales'];
    const rows = (data?.daily || []).map(r => [r.date, r.transaction_count, r.items_sold, peso(r.total_sales)]);
    type === 'pdf' ? exportPDF('Daily_Sales', headers, rows) : exportExcel('Daily_Sales', headers, rows);
  };

  return (
    <div className="tab-body">
      <div className="filter-bar">
        <div className="filter-group"><label className="form-label">From</label>
          <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div className="filter-group"><label className="form-label">To</label>
          <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={load}>Generate</button>
      </div>
      {banner && <Banner type={banner.type} message={banner.msg} onClose={() => setBanner(null)} />}
      {loading && <div className="loading-center"><div className="spinner" /></div>}
      {data && (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-card__val">{data.summary?.total_transactions || 0}</div>
              <div className="stat-card__label">Transactions</div>
            </div>
            <div className="stat-card stat-card--primary">
              <div className="stat-card__val">{peso(data.summary?.total_revenue || 0)}</div>
              <div className="stat-card__label">Total Revenue</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__val">{peso(data.summary?.avg_transaction || 0)}</div>
              <div className="stat-card__label">Avg Transaction</div>
            </div>
          </div>
          <div className="export-bar">
            <button className="btn btn-ghost btn-sm" onClick={() => doExport('pdf')}><i className="fi fi-sr-file-pdf" /> PDF</button>
            <button className="btn btn-ghost btn-sm" onClick={() => doExport('excel')}><i className="fi fi-sr-file-excel" /> Excel</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Transactions</th><th>Items Sold</th><th style={{textAlign:'right'}}>Total Sales</th></tr></thead>
              <tbody>
                {data.daily.length === 0
                  ? <tr><td colSpan={4} className="table-empty">No data for this period.</td></tr>
                  : data.daily.map(r => (
                    <tr key={r.date}>
                      <td>{r.date}</td>
                      <td>{r.transaction_count}</td>
                      <td>{r.items_sold}</td>
                      <td style={{textAlign:'right'}}><strong className="price-mono">{peso(r.total_sales)}</strong></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Monthly Sales ───────────────────────────────────────
function MonthlyTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState(null);

  const load = async () => {
    setLoading(true); setBanner(null);
    try {
      const r = await api.get('/reports/monthly.php');
      setData(r.data);
    } catch (err) {
      setBanner({ type: 'error', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  const doExport = (type) => {
    const h = ['Month', 'Transactions', 'Items Sold', 'Total Sales'];
    const r = (data || []).map(d => [d.month_label, d.transaction_count, d.items_sold, peso(d.total_sales)]);
    type === 'pdf' ? exportPDF('Monthly_Sales', h, r) : exportExcel('Monthly_Sales', h, r);
  };

  return (
    <div className="tab-body">
      <div className="filter-bar">
        <button className="btn btn-primary" onClick={load}>Load Last 12 Months</button>
      </div>
      {banner && <Banner type={banner.type} message={banner.msg} onClose={() => setBanner(null)} />}
      {loading && <div className="loading-center"><div className="spinner" /></div>}
      {data && (
        <>
          <div className="export-bar">
            <button className="btn btn-ghost btn-sm" onClick={() => doExport('pdf')}>⬇️ PDF</button>
            <button className="btn btn-ghost btn-sm" onClick={() => doExport('excel')}>⬇️ Excel</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Month</th><th>Transactions</th><th>Items Sold</th><th style={{textAlign:'right'}}>Total Sales</th></tr></thead>
              <tbody>
                {data.length === 0
                  ? <tr><td colSpan={4} className="table-empty">No data yet.</td></tr>
                  : data.map(r => (
                    <tr key={r.month}>
                      <td><strong>{r.month_label}</strong></td>
                      <td>{r.transaction_count}</td>
                      <td>{r.items_sold}</td>
                      <td style={{textAlign:'right'}}><strong className="price-mono">{peso(r.total_sales)}</strong></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Best Sellers ────────────────────────────────────────
function BestSellersTab() {
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo,   setDateTo]   = useState(today());
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [banner,   setBanner]   = useState(null);

  const load = async () => {
    setLoading(true); setBanner(null);
    try {
      const q = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, limit: 20 });
      const r = await api.get('/reports/best_selling.php?' + q);
      setData(r.data);
    } catch (err) {
      setBanner({ type: 'error', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  const doExport = (type) => {
    const h = ['#', 'Product', 'Qty Sold', 'Revenue', 'Total Cost', 'Profit'];
    const r = (data || []).map((d, i) => [
      i+1,
      d.product_name, 
      d.total_qty, 
      peso(d.total_revenue),  
      d.cost_price > 0 ? peso(d.total_cost) : '—',
      d.cost_price > 0 ? peso(d.profit) : 'No cost set',
    ]);
    type === 'pdf' ? exportPDF('Best_Sellers', h, r) : exportExcel('Best_Sellers', h, r);
  };

  return (
    <div className="tab-body">
      <div className="filter-bar">
        <div className="filter-group"><label className="form-label">From</label>
          <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div className="filter-group"><label className="form-label">To</label>
          <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={load}>Generate</button>
      </div>
      {banner && <Banner type={banner.type} message={banner.msg} onClose={() => setBanner(null)} />}
      {loading && <div className="loading-center"><div className="spinner" /></div>}
      {data && (
        <>
          <div className="export-bar">
            <button className="btn btn-ghost btn-sm" onClick={() => doExport('pdf')}>⬇️ PDF</button>
            <button className="btn btn-ghost btn-sm" onClick={() => doExport('excel')}>⬇️ Excel</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th style={{textAlign:'right'}}>Qty Sold</th>
                  <th style={{textAlign:'right'}}>Revenue</th><th style={{textAlign:'right'}}>Cost</th>
                  <th style={{textAlign:'right'}}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0
                  ? <tr>
                      <td colSpan={6} className="table-empty">No sales data for this period.</td>
                    </tr>
                  : data.map((r, i) => {
                    const hasProfit = parseFloat(r.cost_price) > 0;
                    const profit    = parseFloat(r.profit || 0);
                    return (
                    <tr key={i}>
                      <td><span className="rank-badge">{i + 1}</span></td>
                      <td><strong>{r.product_name}</strong></td>
                      <td style={{textAlign:'right'}}><strong>{r.total_qty}</strong></td>
                      <td style={{textAlign:'right'}}><span className="price-mono">{peso(r.total_revenue)}</span></td>
                      <td style={{textAlign:'right'}}>
                        <span className="price-mono" style={{color: 'var(--text3)'}}> 
                          {hasProfit ? peso(r.total_cost) : '—'}
                        </span>
                      </td>
                      <td style={{textAlign:'right'}}>
                        { hasProfit 
                          ? <span className="price-mono" style={{color: profit >= 0 ? 'var(--green)' : 'var(--red)'}}>
                              {peso(profit)}
                            </span> 
                          : <span className="text-muted" style={{color: 'var(--text3)'}}> No cost set </span>
                        }
                      </td>
                    </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Low Stock ───────────────────────────────────────────
function LowStockTab() {
  const [threshold, setThreshold] = useState(10);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [banner,    setBanner]    = useState(null);

  const load = async () => {
    setLoading(true); setBanner(null);
    try {
      const r = await api.get(`/reports/low_stock.php?threshold=${threshold}`);
      setData(r.data);
    } catch (err) {
      setBanner({ type: 'error', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  const doExport = (type) => {
    const h = ['Product', 'SKU', 'Category', 'Stock', 'Price'];
    const r = (data?.products || []).map(d => [d.name, d.sku || '—', d.category_name || '—', d.stock, peso(d.price)]);
    type === 'pdf' ? exportPDF('Low_Stock_Alert', h, r) : exportExcel('Low_Stock_Alert', h, r);
  };

  return (
    <div className="tab-body">
      <div className="filter-bar">
        <div className="filter-group">
          <label className="form-label">Low Stock Threshold</label>
          <input type="number" className="input" min="1" value={threshold}
            onChange={e => setThreshold(e.target.value)} style={{width:100}} />
        </div>
        <button className="btn btn-primary" onClick={load}>Check Stock</button>
      </div>
      {banner && <Banner type={banner.type} message={banner.msg} onClose={() => setBanner(null)} />}
      {loading && <div className="loading-center"><div className="spinner" /></div>}
      {data && (
        <>
          {data.count > 0 && (
            <div className="low-stock-alert">
              ⚠ <strong>{data.count}</strong> product{data.count !== 1 ? 's' : ''} at or below {data.threshold} units
            </div>
          )}
          <div className="export-bar">
            <button className="btn btn-ghost btn-sm" onClick={() => doExport('pdf')}>⬇️ PDF</button>
            <button className="btn btn-ghost btn-sm" onClick={() => doExport('excel')}>⬇️ Excel</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th style={{textAlign:'right'}}>Stock</th><th style={{textAlign:'right'}}>Price</th></tr></thead>
              <tbody>
                {data.products.length === 0
                  ? <tr><td colSpan={5} className="table-empty">✅ All products are sufficiently stocked.</td></tr>
                  : data.products.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td><code className="sku-code">{p.sku || '—'}</code></td>
                      <td>{p.category_name ? <span className="badge badge--cat">{p.category_name}</span> : '—'}</td>
                      <td style={{textAlign:'right'}}>
                        <span className={`badge ${p.stock <= 0 ? 'badge--danger' : 'badge--warn'}`}>{p.stock <= 0 ? 'OUT' : p.stock}</span>
                      </td>
                      <td style={{textAlign:'right'}}><span className="price-mono">{peso(p.price)}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
const TABS = [
  { id: 'daily',    label: 'Daily Sales',   icon: 'fi fi-sr-calendar-day' },
  { id: 'monthly',  label: 'Monthly Sales', icon: 'fi fi-sr-calendar' },
  { id: 'best',     label: 'Best Sellers',  icon: 'fi fi-sr-trophy' },
  { id: 'lowstock', label: 'Low Stock',     icon: 'fi fi-sr-triangle-warning' },
];

export default function ReportsPage() {
  const [active, setActive] = useState('daily');
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Sales analytics and inventory alerts</p>
        </div>
      </div>

     <div className="tabs">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`tab-btn ${active === t.id ? 'tab-btn--active' : ''}`}
          onClick={() => setActive(t.id)}
        >
          <i className={`tab-icon ${t.icon}`}></i>
          <span>{t.label}</span>
        </button>
      ))}
    </div>

      {active === 'daily'    && <DailyTab />}
      {active === 'monthly'  && <MonthlyTab />}
      {active === 'best'     && <BestSellersTab />}
      {active === 'lowstock' && <LowStockTab />}
    </div>
  );
}
