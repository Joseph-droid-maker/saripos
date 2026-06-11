import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api, imgUrl, peso } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from '../components/ui/Modal.jsx';
import Banner from '../components/ui/Banner.jsx';

// ── Product card in the grid ─────────────────────────────────
function ProductCard({ product, onAdd }) {
  const isOut = product.stock <= 0;
  const isLow = !isOut && product.stock <= 10;
  const img   = imgUrl(product.image_path);

  return (
    <div
      className={`product-card ${isOut ? 'product-card--out' : ''}`}
      onClick={() => !isOut && onAdd(product)}
      role="button"
      tabIndex={isOut ? -1 : 0}
      onKeyDown={e => e.key === 'Enter' && !isOut && onAdd(product)}
      title={isOut ? 'Out of stock' : `Add ${product.name}`}
    >
      <div className="product-card__img-wrap">
        {img
          ? <img src={img} alt={product.name} className="product-card__img" />
          : <div className="product-card__placeholder">{product.name[0].toUpperCase()}</div>
        }
        {isOut && <span className="product-card__badge product-card__badge--out">Out</span>}
        {isLow && <span className="product-card__badge product-card__badge--low">Low</span>}
      </div>
      <div className="product-card__body">
        <p className="product-card__name">{product.name}</p>
        {product.category_name && (
          <span className="product-card__cat">{product.category_name}</span>
        )}
        <p className="product-card__price">{peso(product.price)}</p>
      </div>
    </div>
  );
}

// ── Single cart row ──────────────────────────────────────────
function CartItem({ item, onQtyChange, onRemove }) {
  return (
    <div className="cart-item">
      <div className="cart-item__info">
        <p className="cart-item__name">{item.product.name}</p>
        <p className="cart-item__unit">{peso(item.product.price)} each</p>
      </div>
      <div className="cart-item__qty">
        <button className="qty-btn" onClick={() => onQtyChange(item.product.id, item.quantity - 1)}>−</button>
        <span className="qty-val">{item.quantity}</span>
        <button className="qty-btn" onClick={() => onQtyChange(item.product.id, item.quantity + 1)}>+</button>
      </div>
      <div className="cart-item__right">
        <p className="cart-item__sub">{peso(item.subtotal)}</p>
        <button className="cart-item__del" onClick={() => onRemove(item.product.id)}>✕</button>
      </div>
    </div>
  );
}

// ── Receipt modal ────────────────────────────────────────────
function ReceiptModal({ transaction, onClose }) {
  const [mode, setMode] = useState('normal'); // 'normal' | 'thermal'
  const receiptRef = useRef(null);

  const handlePrint = () => {
    document.body.classList.add('printing', `print-${mode}`);
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing', `print-${mode}`);
    }, 800);
  };

  const d = new Date(transaction.created_at);

  return (
    <Modal open onClose={onClose} title="✅ Transaction Complete" size="md"
      footer={
        <div className="receipt-actions">
          <div className="receipt-mode-pick">
            <label>Print Mode</label>
            <select className="input" value={mode} onChange={e => setMode(e.target.value)} style={{width:'auto'}}>
              <option value="normal">Normal (A4)</option>
              <option value="thermal">Thermal (72 mm)</option>
            </select>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={handlePrint}>🖨️ Print</button>
          </div>
        </div>
      }
    >
      <div id="receipt-print" ref={receiptRef} className={`receipt receipt--${mode}`}>
        <div className="receipt__head">
          <p className="receipt__store">🏪 SariPOS</p>
          <p className="receipt__date">
            {d.toLocaleDateString('en-PH')} {d.toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'})}
          </p>
          <p className="receipt__txn-id">#{transaction.transaction_code}</p>
          <p className="receipt__cashier">Cashier: {transaction.cashier_name}</p>
        </div>

        <div className="receipt__divider" />

        <div className="receipt__items">
          {(transaction.items || []).map((item, i) => (
            <div key={i} className="receipt__item">
              <span className="receipt__item-name">{item.product_name}</span>
              <span className="receipt__item-qty">{item.quantity} × {peso(item.unit_price)}</span>
              <span className="receipt__item-total">{peso(item.subtotal)}</span>
            </div>
          ))}
        </div>

        <div className="receipt__divider" />

        <div className="receipt__summary">
          <div className="receipt__row"><span>TOTAL</span>        <strong>{peso(transaction.total)}</strong></div>
          <div className="receipt__row"><span>Cash Given</span>   <span>{peso(transaction.cash_given)}</span></div>
          <div className="receipt__row receipt__row--change"><span>CHANGE</span><strong>{peso(transaction.change_amount)}</strong></div>
        </div>

        <div className="receipt__foot">
          <p>Thank you! Come again! 🙏</p>
        </div>
      </div>
    </Modal>
  );
}

// ── Main POS Page ────────────────────────────────────────────
export default function POSPage() {

  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  
  const [cart, setCart] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pos_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [cash, setCash] = useState(() => {
    return sessionStorage.getItem('pos_cash') || '';
  });

  const [search,     setSearch]     = useState('');
  const [activeCat,  setActiveCat]  = useState('all');
  const [loading,    setLoading]    = useState(true);
  const [processing, setProcessing] = useState(false);
  const [receipt,    setReceipt]    = useState(null);
  const [banner,     setBanner]     = useState(null);

  // ── Derived values ─────────────────────────────────────────
  const total    = cart.reduce((s, i) => s + i.subtotal, 0);
  const cashNum  = parseFloat(cash) || 0;
  const change   = cashNum - total;
  const canCharge = cart.length > 0 && cashNum >= total && total > 0;

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
    const matchC = activeCat === 'all' || String(p.category_id) === activeCat;
    return matchQ && matchC;
  });



  // ── Data loading ───────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true); setBanner(null);
    try {
      const [pr, cr] = await Promise.all([
        api.get('/products/index.php'),
        api.get('/categories/index.php'),
      ]);
      setProducts(pr.data || []);
      setCategories(cr.data || []);
    } catch (err) {
      setBanner({ type: 'error', msg: 'Could not load products: ' + err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (cart.length > 0) {
      sessionStorage.setItem('pos_cart', JSON.stringify(cart));
    } else {
      sessionStorage.removeItem('pos_cart');
    }
  }, [cart]);

  useEffect(() => {
    if (cash) {
      sessionStorage.setItem('pos_cash', cash);
    } else {
      sessionStorage.removeItem('pos_cash');
    }
  }, [cash]);



  // ── Cart actions ───────────────────────────────────────────
  const addToCart = (product) => {
    if (product.stock <= 0) { 
      toast.error('Out of stock'); 
      return; 
    }

    const existing = cart.find(i => i.product.id === product.id);

    if (existing && existing.quantity >= product.stock) {
      toast.error('Not enough stock');
      return;
    }
    
    setCart(prev => {

      const idx = prev.findIndex(i => i.product.id === product.id);
      
      if (idx > -1) {
        const cur = prev[idx].quantity;

        return prev.map((i, n) => n === idx
          ? { ...i, quantity: cur + 1, subtotal: (cur + 1) * i.product.price }
          : i
        );
      }
      return [...prev, { product, quantity: 1, subtotal: + product.price }];
    });
    toast.success(`${product.name} added`, { duration: 800 });
  };

  const updateQty = (productId, newQty) => {
    if (newQty <= 0) { removeItem(productId); return; }
    setCart(prev => {
      const item = prev.find(i => i.product.id === productId);
      if (item && newQty > item.product.stock) { toast.error('Not enough stock'); return prev; }
      return prev.map(i => i.product.id === productId
        ? { ...i, quantity: newQty, subtotal: newQty * i.product.price }
        : i
      );
    });
  };

  const removeItem = (productId) => setCart(prev => prev.filter(i => i.product.id !== productId));

  const clearCart = () => { setCart([]); setCash(''); setBanner(null); };

  // ── Checkout ───────────────────────────────────────────────
  const checkout = async () => {
    if (!canCharge || processing) return;
    setProcessing(true); setBanner(null);
    try {
      const res = await api.post('/transactions/index.php', {
        items: cart.map(i => ({
          product_id:    i.product.id,
          product_name:  i.product.name,
          product_sku:   i.product.sku || null,
          unit_price:    i.product.price,
          quantity:      i.quantity,
          subtotal:      i.subtotal,
        })),
        total,
        cash_given:    cashNum,
        change_amount: change,
      });
      setReceipt(res.data);
      clearCart();
      loadData();
      toast.success('Transaction saved!');
    } catch (err) {
      setBanner({ type: 'error', msg: err.message });
    } finally { 
      setProcessing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="pos-layout">

      {/* ── LEFT: Product Browser ── */}
      <div className="pos-left">
        {banner && (
          <Banner type={banner.type} message={banner.msg} onClose={() => setBanner(null)} />
        )}

        <div className="pos-toolbar">
          <input
            className="input pos-search"
            placeholder="🔍 Search by name or SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="pos-cats">
          <button
            className={`cat-pill ${activeCat === 'all' ? 'cat-pill--on' : ''}`}
            onClick={() => setActiveCat('all')}
          >All</button>
          {categories.map(c => (
            <button
              key={c.id}
              className={`cat-pill ${activeCat === String(c.id) ? 'cat-pill--on' : ''}`}
              onClick={() => setActiveCat(String(c.id))}
            >{c.name}</button>
          ))}
        </div>

        {loading ? (
          <div className="pos-status"><div className="spinner" /> Loading products…</div>
        ) : filtered.length === 0 ? (
          <div className="pos-status">No products found.</div>
        ) : (
          <div className="product-grid">
            {filtered.map(p => (
              <ProductCard key={p.id} product={p} onAdd={addToCart} />
            ))}
          </div>
        )}
      </div>

      {/* ── RIGHT: Cart ── */}
      <div className="pos-right">
        <div className="cart-head">
          <h3>Current Order</h3>
          {cart.length > 0 && (
            <button className="btn-text-danger" onClick={clearCart}>Clear all</button>
          )}
        </div>

        <div className="cart-body">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <div className="cart-empty-icon">🛒</div>
              <p>Tap a product to add it to the order</p>
            </div>
          ) : (
            cart.map(item => (
              <CartItem
                key={item.product.id}
                item={item}
                onQtyChange={updateQty}
                onRemove={removeItem}
              />
            ))
          )}
        </div>

        <div className="cart-foot">
          {/* Total row */}
          <div className="cart-total-row">
            <span className="cart-items-count">{cart.reduce((s,i) => s+i.quantity, 0)} item(s)</span>
            <div>
              <span className="cart-total-label">TOTAL</span>
              <span className="cart-total-val">{peso(total)}</span>
            </div>
          </div>

          {/* Cash input */}
          <div className="form-group">
            <label className="form-label">Cash Given (₱)</label>
            <input
              type="number"
              className="input cash-input"
              placeholder="0.00"
              value={cash}
              onChange={e => setCash(e.target.value)}
              min="0"
              step="0.01"
            />
          </div>

          {/* Validation */}
          {cashNum > 0 && cashNum < total && (
            <p className="cash-short">⚠ Short by {peso(total - cashNum)}</p>
          )}

          {/* Change */}
          {change >= 0 && cashNum > 0 && (
            <div className="cart-change">
              <span>Change</span>
              <strong>{peso(change)}</strong>
            </div>
          )}

          {/* Charge button */}
          <button
            className="btn-charge"
            onClick={checkout}
            disabled={!canCharge || processing}
          >
            {processing ? 'Processing…' : `⚡ Charge ${peso(total)}`}
          </button>
        </div>
      </div>

      {/* Receipt modal */}
      {receipt && (
        <ReceiptModal transaction={receipt} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}
