import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, imgUrl, peso } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from '../components/ui/Modal.jsx';
import Banner from '../components/ui/Banner.jsx';


function StockModal({ product, onClose, onSaved }) {
  const [type,    setType]    = useState('in');
  const [qty,     setQty]     = useState('');
  const [notes,   setNotes]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const handleSave = async () => {
    const q = parseInt(qty);
    if (!q || q <= 0) { setError('Enter a valid quantity.'); return; }
    if (type === 'out' && q > product.stock) {
      setError(`Only ${product.stock} unit(s) in stock.`); return;
    }
    setSaving(true);
    try {
      await api.post('/products/restock.php', {
        product_id: product.id, quantity: q, type, notes,
      });
      toast.success(type === 'in' ? `+${q} added to stock` : `-${q} removed from stock`);
      onSaved(); onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`📦 Adjust Stock — ${product.name}`} size="sm"
      footer={
        <div className="modal-footer-btns">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      }
    >
      <div className="stock-current">
        <span className="stock-current__label">Current Stock</span>
        <span className="stock-current__val">{product.stock} units</span>
      </div>

      <div className="form-group">
        <label className="form-label">Adjustment Type</label>
        <div style={{ display:'flex', gap:8 }}>
          <button
            className={`btn ${type==='in' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setType('in')}
          >📦 Stock In</button>
          <button
            className={`btn ${type==='out' ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setType('out')}
          >📤 Stock Out</button>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Quantity</label>
        <input
          type="number" min="1" className={`input ${error ? 'input--error' : ''}`}
          placeholder="0" value={qty}
          onChange={e => { setQty(e.target.value); setError(''); }}
        />
        {error && <p className="field-error">{error}</p>}
        {qty && !error && (
          <p className="form-hint">
            New stock will be:&nbsp;
            <strong>
              {type === 'in'
                ? product.stock + parseInt(qty || 0)
                : product.stock - parseInt(qty || 0)
              } units
            </strong>
          </p>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Notes <span className="text-muted">(optional)</span></label>
        <input className="input" placeholder="e.g. New delivery, expired, damaged…"
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

// ── CSV + Excel Import sub-modal ─────────────────────────────
function ImportModal({ onClose }) {

  const { csrfToken } = useAuth();

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState('');
  const [importMode, setImportMode] = useState('skip');

  const downloadTemplate = () => {
    const csv = [
      'Item Name,Description/Size,Current Stock,Cost Price,Retail Price,SKU,Category',
      'Coca-Cola 1.5L,,50,67.80,80,CC-1.5L,Drinks',
      'Lucky Me Pancit Canton,,200,10.50,14,LM-PC,Noodles',
      'Safeguard Soap,,80,30.00,38,SG-SOAP,Toiletries',
    ].join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: 'Jing-Jing_template.csv',
    });
    a.click();
  };

  // Converts Excel file to a CSV File object using the xlsx library.
  const excelToCsvFile = async (excelFile) => {
    const XLSX = await import('xlsx');
    const buffer = await excelFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Use the first sheet
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const csvString  = XLSX.utils.sheet_to_csv(firstSheet);

    // Wrap the CSV string as a File so we can send it to the same PHP endpoint
    return new File([csvString], 'import.csv', { type: 'text/csv' });
  };

  const handleImport = async () => {
    if (!file) { toast.error('Please select a file first.'); return; }

    setLoading(true);
    setParseError('');

    try {
      let uploadFile = file;

      // If Excel, convert to CSV first (all on the frontend — no PHP library needed)
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      if (isExcel) {
        uploadFile = await excelToCsvFile(file);
      }

      const fd = new FormData();
      fd.append('csrf_token', csrfToken);
      fd.append('mode', importMode); 
      fd.append('csv', uploadFile);

      const res = await api.post('/products/import.php', fd);
      setResult(res.data);
      toast.success(`Import done: ${res.data.inserted} added, ${res.data.updated} updated`);
    } catch (err) {
      setParseError(err.message);
      toast.error('Import failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="↑ Import Products"
      size="md"
      footer={
        <div className="modal-footer-btns">
          <button className="btn btn-ghost" onClick={onClose}>{result ? 'Done' : 'Cancel'}</button>
          {!result && (
            <button className="btn btn-primary" onClick={handleImport} disabled={loading}>
              {loading ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      }
    >
      <div className="form-group">
        <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
          <i className="fi fi-sr-download" /> Download Template (CSV)
        </button>
        <p className="form-hint">
          Accepts <strong>.csv</strong> or <strong>.xlsx / .xls</strong><br />
          Supported columns: <code>Item Name</code>, <code>Description/Size</code>, <code>Current Stock</code>,&nbsp;
          <code>Cost Price</code>, <code>Retail Price</code>, <code>SKU</code>, <code>Category</code><br />
          Blank rows are automatically skipped.
        </p>
      </div>

      {/* Import mode selector */}
      <div className="form-group">
        <label className="form-label">Import Mode</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn btn-sm ${importMode === 'skip' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setImportMode('skip')}
          >
            Skip Duplicates
          </button>
          <button
            type="button"
            className={`btn btn-sm ${importMode === 'overwrite' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setImportMode('overwrite')}
          >
            Overwrite
          </button>
        </div>
        <p className="form-hint">
          {importMode === 'skip'
            ? 'Existing products (matched by SKU or name) are left untouched. Only new rows are added.'
            : 'Existing products are updated and their stock is increased by the imported quantity.'
          }
        </p>
      </div>
      
      {!result && (
        <div className="form-group">
          <label className="form-label">Select File</label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="input"
            onChange={e => { setFile(e.target.files[0]); setResult(null); setParseError(''); }}
          />
          {file && (
            <p className="form-hint">
              Selected: <strong>{file.name}</strong>
              {/\.(xlsx|xls)$/i.test(file.name) && ' — will be converted from Excel automatically'}
            </p>
          )}
        </div>
      )}

      {parseError && <p className="field-error">⚠ {parseError}</p>}

      {result && (
        <div className="import-result">
          <div className="import-result__row import-result__row--ok">
            <i className="fi fi-sr-check-circle"></i> <strong>{result.inserted}</strong> products added  
          </div>
          <div className="import-result__row import-result__row--info">
            <i className="fi fi-sr-forward"></i> <strong>{result.updated}</strong> products updated
          </div>
          <div className="import-result__row">
            <i className="fi fi-sr-cross-circle"></i> <strong>{result.skipped}</strong> rows skipped
          </div>
          {result.errors?.length > 0 && (
            <div className="import-errors">
              <p className="form-label" style={{marginTop:8}}>Row errors:</p>
              {result.errors.map((e, i) => <p key={i} className="field-error">{e}</p>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Category Management Modal ────────────────────────────────
function CategoryModal({ categories, onClose, onSaved }) {
  const [newName, setNewName] = useState('');
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [deleteId,  setDeleteId]  = useState(null);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { setError('Category name is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/categories/index.php', { name });
      toast.success(`"${name}" added!`);
      setNewName('');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/categories/index.php?id=${id}`);
      toast.success('Category removed.');
      setDeleteId(null);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toDelete = categories.find(c => c.id === deleteId);

  return (
    <>
      <Modal open onClose={onClose} title="🏷️ Manage Categories" size="sm"
        footer={<div className="modal-footer-btns"><button className="btn btn-primary" onClick={onClose}>Done</button></div>}
      >
        <div className="form-group">
          <label className="form-label">Add New Category</label>
          <div style={{ display:'flex', gap:8 }}>
            <input
              className={`input ${error ? 'input--error' : ''}`}
              placeholder="e.g. Frozen Goods"
              value={newName}
              onChange={e => { setNewName(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button className="btn btn-primary" onClick={handleAdd} disabled={saving} style={{ flexShrink:0 }}>
              {saving ? '…' : '+ Add'}
            </button>
          </div>
          {error && <p className="field-error">{error}</p>}
        </div>
        <div className="form-group">
          <label className="form-label">Existing ({categories.length})</label>
          <div className="cat-list">
            {categories.map(c => (
              <div key={c.id} className="cat-list__item">
                 <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span className="badge badge--cat">{c.name}</span>
                  <span className="text-muted">{c.product_count} product{c.product_count !== '1' ? 's' : ''}</span>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setDeleteId(c.id)}
                  title="Remove category"
                >🗑️</button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Delete category confirmation */}
        <Modal
          open={deleteId !== null}
          onClose={() => setDeleteId(null)}
          title="Remove Category"
          danger size="sm"
          footer={
            <div className="modal-footer-btns">
              <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteId)}>Yes, Remove</button>
            </div>
          }
        >
          <p>Remove <strong>"{toDelete?.name}"</strong>?</p>
          {toDelete?.product_count > 0
            ? <p className="field-error" style={{marginTop:8}}>
                ⚠ This category has {toDelete.product_count} product(s). Reassign them first.
              </p>
            : <p className="form-hint" style={{marginTop:8}}>This category has no products and can be safely removed.</p>
          }
        </Modal>
    </>
  );
}
// ── Main Page ────────────────────────────────────────────────
export default function ProductsPage() {
  
  const { user, csrfToken } = useAuth(); // add csrfToken here
  const isAdmin     = user?.role === 'admin';

  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [search,     setSearch]     = useState('');
  const [filterCat,  setFilterCat]  = useState('');
  const [filterStock, setFilterStock] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active'); 
  const [loading,    setLoading]    = useState(true);
  const [banner,     setBanner]     = useState(null);
  const [modal,      setModal]      = useState(null); // null | 'form' | 'import'
  const [editing,    setEditing]    = useState(null);
  const [deleteId,   setDeleteId]   = useState(null);
  const [stockProd,  setStockProd]  = useState(null);
  const [catModal,   setCatModal]   = useState(false);

  const EMPTY_FORM = { name:'', description:'', sku:'', price:'',cost_price:'', stock:'', category_id:'' };
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [imageFile,  setImageFile]  = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [saving,     setSaving]     = useState(false);
  
  

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setBanner(null);
    try {
      // NEW: only add the query string when viewing the Inactive tab —
      // keeps the default request identical to before for the common case.
      const statusQuery = filterStatus === 'inactive' ? '?status=inactive' : '';
      const [pr, cr] = await Promise.all([
        api.get(`/products/index.php${statusQuery}`), // CHANGED: was a static string
        api.get('/categories/index.php'),
      ]);
      setProducts(pr.data || []);
      setCategories(cr.data || []);
    } catch (err) {
      setBanner({ type: 'error', msg: err.message });
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  // ── Filtered list + stats ──────────────────────────────────
const filtered = products.filter(p => {
  const q = search.toLowerCase();
  const matchSearch = !q ||
    p.name.toLowerCase().includes(q) ||
    (p.sku || '').toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q);
  const matchCat = !filterCat || String(p.category_id) === filterCat;
  const matchStock =
    filterStock === 'all' ||
    (filterStock === 'in'  &&  p.stock > 0) ||
    (filterStock === 'out' &&  p.stock <= 0) ||
    (filterStock === 'low' &&  p.stock > 0 && p.stock <= 10);
  return matchSearch && matchCat && matchStock;
});

  const outOfStock = products.filter(p => p.stock <= 0).length;
  const lowStock   = products.filter(p => p.stock > 0 && p.stock <= 10).length;

  // ── Open add ──────────────────────────────────────────────
  const openAdd = () => {
    setForm(EMPTY_FORM); setFormErrors({});
    setImageFile(null);  setImgPreview(null);
    setEditing(null);    setModal('form');
  };

  // ── Open edit ─────────────────────────────────────────────
  const openEdit = (p) => {
    setForm({
        name: p.name, description: p.description || '',
        sku: p.sku || '', price: p.price, cost_price: p.cost_price || '',
        stock: p.stock, category_id: p.category_id || '', 
      });
    setFormErrors({});
    setImageFile(null);
    setImgPreview(p.image_path ? imgUrl(p.image_path) : null);
    setEditing(p); setModal('form');
  };

  // ── Validation ─────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.name.trim())                         e.name  = 'Product name is required.';
    if (!form.price || parseFloat(form.price) <= 0) e.price = 'Price must be greater than 0.';
    if (form.stock === '' || parseInt(form.stock) < 0) e.stock = 'Stock cannot be negative.';
    setFormErrors(e);
    return !Object.keys(e).length;
  };

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name:        form.name.trim(),
        description: form.description.trim() || null,
        sku:         form.sku.trim() || null,
        price:       parseFloat(form.price),
        cost_price:  parseFloat(form.cost_price) || null,
        stock:       parseInt(form.stock),
        category_id: form.category_id ? parseInt(form.category_id) : null,
      };

      let saved;
      if (editing) {
        const r = await api.put(`/products/single.php?id=${editing.id}`, payload);
        saved = r.data;
        toast.success('Product updated!');
      } else {
        const r = await api.post('/products/index.php', payload);
        saved = r.data;
        toast.success('Product added!');
      }

      // Upload image if chosen
      if (imageFile && saved) {
        const fd = new FormData();
        fd.append('csrf_token', csrfToken);
        fd.append('image', imageFile);
        fd.append('product_id', saved.id);
        await api.post('/products/upload.php', fd);
      }

      setModal(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────
  const handleToggle = async () => {
    const p = products.find(p => p.id === deleteId); // look up the row by id
    if (!p) return; // guard: stale id / modal already closed, nothing to do

    try {
      if (p.is_active) {
        await api.delete(`/products/single.php?id=${p.id}`); // soft-deactivate
        toast.success('Product deactivated.');
      } else {
        await api.patch(`/products/single.php?id=${p.id}`);  // reactivate
        toast.success('Product reactivated.');
      }
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleProduct = products.find(p => p.id === deleteId);

  const setField = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setFormErrors(fe => ({ ...fe, [key]: '' }));
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header__titles">
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">Manage your store inventory</p>
        </div>
        {isAdmin && (
          <div className="action-bar">
            <button className="btn btn-ghost" onClick={() => setCatModal(true)}><i className="fi fi-sr-boxes" /> Categories</button>
            <button className="btn btn-ghost" onClick={() => setModal('import')}><i className="fi fi-sr-download" /> Import CSV / Excel</button>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
          </div>
        )}
      </div>

      {banner && <Banner type={banner.type} message={banner.msg} onClose={() => setBanner(null)} />}

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card__val">{products.length}</div>
          <div className="stat-card__label">Total Products</div>
        </div>
        <div className="stat-card stat-card--warn">
          <div className="stat-card__val">{lowStock}</div>
          <div className="stat-card__label">Low Stock (≤10)</div>
        </div>
        <div className="stat-card stat-card--danger">
          <div className="stat-card__val">{outOfStock}</div>
          <div className="stat-card__label">Out of Stock</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          className="input"
          placeholder="Search by name, SKU, description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select className="input" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ maxWidth: 200, appearance: "none",WebkitAppearance: "none", MozAppearance: "none"}}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          className="input"
          value={filterStock}
          onChange={e => setFilterStock(e.target.value)}
          style={{ maxWidth: 190, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
        >
          <option value="all">All Stock</option>
          <option value="in">In Stock</option>
          <option value="out">Out of Stock</option>
          <option value="low">Low Stock (≤10)</option>
        </select>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn btn-sm ${filterStatus === 'active' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterStatus('active')}
            >
              Active
            </button>
            <button
              className={`btn btn-sm ${filterStatus === 'inactive' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterStatus('inactive')}
            >
              Inactive
            </button>
          </div>
        )}


        <span className="filter-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /><span>Loading…</span></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Img</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Cost</th>
                <th>Price</th>
                <th>Stock</th>
                {isAdmin && <th style={{ width: 120 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="table-empty">
                    No products found.
                  </td>
                </tr>
              ) : filtered.map(p => (
                <tr key={p.id}>
                  <td>
                    {p.image_path
                      ? <img src={imgUrl(p.image_path)} alt={p.name} className="product-thumb" />
                      : <div className="product-thumb-ph">{p.name[0].toUpperCase()}</div>
                    }
                  </td>
                  <td>
                    <strong>{p.name}</strong>
                     {p.description && <div className="text-muted" style={{fontSize:11}}>{p.description}</div>}
                  </td>
                  <td><code className="sku-code">{p.sku || '—'}</code></td>
                  <td>
                    {p.category_name
                      ? <span className="badge badge--cat">{p.category_name}</span>
                      : <span className="text-muted">—</span>
                    }
                  </td>
                  <td><span className="price-mono" style={{color:'var(--text3)'}}>{p.cost_price > 0 ? peso(p.cost_price) : '—'}</span></td>
                  <td><span className="price-mono">{peso(p.price)}</span></td>
                  <td>
                    <span className={`badge ${p.stock <= 0 ? 'badge--danger' : p.stock <= 10 ? 'badge--warn' : 'badge--ok'}`}>
                      {p.stock <= 0 ? 'Out' : p.stock}
                    </span>
                  </td>
                                    {isAdmin && (
                    <td>
                      <div className="table-actions">
                        {p.is_active ? (
                          <>
                            <button className="btn btn-ghost btn-sm" title="Update Stock" onClick={() => setStockProd(p)}><i className="fi fi-sr-box" /></button>
                            <button className="btn btn-ghost btn-sm" title="Edit Product" onClick={() => openEdit(p)}><i className="fi fi-sr-edit" /></button>
                            <button className="btn btn-danger btn-sm" title="Deactivate Product" onClick={() => setDeleteId(p.id)}><i className="fi fi-sr-trash" /></button>
                          </>
                        ) : (
                          <button className="btn btn-ghost btn-sm" title="Reactivate Product" onClick={() => setDeleteId(p.id)}>
                            <i className="fi fi-sr-rotate-left" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        open={modal === 'form'}
        onClose={() => setModal(null)}
        title={editing ? '✏️ Edit Product' : '+ Add Product'}
        size="md"
        footer={
          <div className="modal-footer-btns">
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Product'}
            </button>
          </div>
        }
      >
        <div className="form-grid">
          <div className="form-group form-span-2">
            <label className="form-label">Product Name *</label>
            <input className={`input ${formErrors.name ? 'input--error' : ''}`}
              placeholder="e.g. Coca-Cola 1.5L"
              value={form.name}
              onChange={e => setField('name', e.target.value)}
            />
            {formErrors.name && <p className="field-error">{formErrors.name}</p>}
          </div>

            <div className="form-group form-span-2">
            <label className="form-label">Description / Size <span className="text-muted">(optional)</span></label>
            <input className="input" placeholder="e.g. 1.5 Liters, Family Size…"
              value={form.description} onChange={e => setField('description', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">SKU <span className="text-muted">(optional)</span></label>
            <input className="input" placeholder="e.g. CC-1.5L"
              value={form.sku} onChange={e => setField('sku', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="input" value={form.category_id} onChange={e => setField('category_id', e.target.value)}>
              <option value="">No category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Cost Price (₱) <span className="text-muted">(buying price)</span></label>
            <input className="input" type="number" min="0" step="0.01" placeholder="0.00"
              value={form.cost_price} onChange={e => setField('cost_price', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Stock *</label>
            <input className={`input ${formErrors.stock ? 'input--error' : ''}`}
              type="number" min="0" step="1" placeholder="0"
              value={form.stock} onChange={e => setField('stock', e.target.value)} />
            {formErrors.stock && <p className="field-error">{formErrors.stock}</p>}
          </div>
          
          <div className="form-group">
            <label className="form-label">Retail Price (₱) * <span className="text-muted">(selling price)</span></label>
            <input className={`input ${formErrors.price ? 'input--error' : ''}`}
              type="number" min="0.01" step="0.01" placeholder="0.00"
              value={form.price} onChange={e => setField('price', e.target.value)} />
            {formErrors.price && <p className="field-error">{formErrors.price}</p>}
            {form.cost_price && form.price && parseFloat(form.price) > parseFloat(form.cost_price) && (
              <p className="form-hint" style={{color:'var(--ok)'}}>
                Margin: {peso(parseFloat(form.price) - parseFloat(form.cost_price))} per unit
              </p>
            )}
          </div>

          <div className="form-group form-span-2">
            <label className="form-label">Product Image <span className="text-muted">(optional)</span></label>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="input"
              onChange={e => {
                const f = e.target.files[0];
                if (f) { setImageFile(f); setImgPreview(URL.createObjectURL(f)); }
              }}
            />
            {imgPreview && (
              <img src={imgPreview} alt="Preview" className="img-preview" />
            )}
            <p className="form-hint">JPG, PNG, WebP — max 2 MB</p>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation ── */}
      <Modal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title={toggleProduct?.is_active ? 'Deactivate Product' : 'Reactivate Product'}
        danger={toggleProduct?.is_active}
        size="sm"
        footer={
          <div className="modal-footer-btns">
            <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
            <button
              className={`btn ${toggleProduct?.is_active ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleToggle}
            >
              {toggleProduct?.is_active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        }
      >
        <p>
          {toggleProduct?.is_active
            ? `Deactivating "${toggleProduct?.name}" will hide it from the POS and product list. Its sales history is kept intact.`
            : `Reactivating "${toggleProduct?.name}" will make it available again in the POS and product list.`
          }
        </p>
      </Modal>

      {/* ── CSV Import ── */}
      {modal === 'import' && (
        <ImportModal onClose={() => { setModal(null); load(); }} />
      )}

      {/* ── Stock Adjustment ── */}
      {stockProd && (
        <StockModal 
          product={stockProd} 
          onClose={() => { setStockProd(null); }}
          onSaved={() => { load(); }} 
        />
      )}

      {/* ── Category Management ── */}
      {catModal && (
        <CategoryModal
          categories={categories}
          onClose={() => setCatModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
