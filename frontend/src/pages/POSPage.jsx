import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api, imgUrl, peso } from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from '../components/ui/Modal.jsx';
import Banner from '../components/ui/Banner.jsx';

// ── Constants ─────────────────────────────────────────────────
// How many categories appear as quick-access pills before the "More" button
const MAX_QUICK_CATS = 6;
// Ceiling for cash input: prevents float overflow / precision loss on huge numbers
const MAX_CASH_INPUT = 9_999_999.99;

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
          <p className="receipt__store">Jing-Jing Store</p>
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

// ── Category Drawer ───────────────────────────────────────────
function CategoryDrawer({ categories, selectedCats, onToggle, onClear, onClose, drawerSearch, setDrawerSearch }) {

  const visible = drawerSearch
    ? categories.filter(c => c.name.toLowerCase().includes(drawerSearch.toLowerCase()))
    : categories;

  return (
    <>
      <div className="cat-drawer__backdrop" onClick={onClose} />
      <div className="cat-drawer__panel" role="dialog" aria-modal="true" aria-label="All Categories">
        <div className="cat-drawer__head">
          <h4>All Categories</h4>
          <button className="cat-drawer__close" onClick={onClose} aria-label="Close drawer">✕</button>
        </div>
        <input
          className="input cat-drawer__search"
          placeholder="Search categories…"
          value={drawerSearch}
          onChange={e => setDrawerSearch(e.target.value)}
          autoFocus
        />
        {selectedCats.size > 0 && (
          <button className="cat-drawer__clear" onClick={onClear}>
            ✕ Clear selection ({selectedCats.size})
          </button>
        )}
        <div className="cat-drawer__list">
          {visible.map(c => {
            const id      = String(c.id);
            const checked = selectedCats.has(id);
            return (
              <label
                key={c.id}
                className={`cat-drawer__item ${checked ? 'cat-drawer__item--on' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(id)}
                />
                <span>{c.name}</span>
              </label>
            );
          })}
          {visible.length === 0 && (
            <p className="cat-drawer__empty">No categories match "{drawerSearch}".</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── [NEW] Confirm Order Modal ────────────────────────────────
// Sits between the "Charge" button and the actual API call.
// The cashier must explicitly click "Confirm & Charge" for the
// transaction to fire — tapping "⚡ Charge" alone only opens this.
//
// Design decisions:
//   - Reuses receipt__* CSS classes for the item list so no new
//     stylesheet entries are needed.
//   - The modal is intentionally kept OPEN (with buttons disabled)
//     while the API call is in flight. Closing it first and then
//     calling checkout() leaves a dead visual gap where nothing
//     visible is happening, which is worse UX than a spinner.
//   - onClose receives a no-op (not undefined) when processing is
//     true. Passing () => {} keeps the prop callable inside the
//     Modal internals without a runtime crash, while making the
//     X button and backdrop clicks effectively do nothing.
//
// Props:
//   cart       – cart items array (same shape as POSPage `cart`)
//   total      – computed order total (Number)
//   cashNum    – parsed cash-given value (Number)
//   change     – computed change = cashNum - total (Number)
//   processing – true while checkout() is awaiting the API
//   onConfirm  – fires checkout() in the parent
//   onCancel   – sets showConfirm(false) without touching the cart
function ConfirmOrderModal({ cart, total, cashNum, change, processing, onConfirm, onCancel }) { // [NEW] pre-checkout summary modal — the only path that fires checkout()

  // Sum of individual line quantities, e.g. "5 items" not "3 products"
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <Modal
      open
      // Block backdrop / X dismissal while the POST is in flight.
      // A no-op is safer than undefined because Modal may call onClose
      // internally (e.g. on Escape keydown) — undefined would throw.
      onClose={processing ? () => {} : onCancel}
      title="Confirm Transaction"
      size="sm"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>

          {/* Back: dismisses without touching the cart so the cashier
               can correct mistakes (wrong cash amount, missed item, etc.) */}
          <button
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={processing} // Cannot cancel mid-POST
          >
            ← Back
          </button>

          {/* The sole button that triggers the real transaction.
               Label switches to "Processing…" during the API call
               so the cashier knows the system is working. */}
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={processing}
          >
            {processing ? 'Processing…' : '✅ Confirm & Charge'}
          </button>
        </div>
      }
    >
      <div className="confirm-order">

        {/* Instructional line — makes it unambiguous that this is a
             one-way, irreversible action (stock deducted, sale recorded) */}
        <p style={{
          fontSize: '0.85rem',
          color: 'var(--color-muted, #666)',
          marginBottom: '0.75rem',
          lineHeight: 1.4,
        }}>
          Review the order before confirming. Stock will be deducted and the sale recorded.
        </p>

        {/* Item count badge — quick sanity check for the cashier */}
        <p style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-muted, #999)',
          marginBottom: '0.4rem',
        }}>
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </p>

        {/* Item list — reuses receipt__* classes directly.
             Source data is cart[] (live state), not transaction.items
             (which only exists after a successful POST). The field
             names differ: item.product.name vs item.product_name, etc. */}
        <div className="receipt__items">
          {cart.map(item => (
            <div key={item.product.id} className="receipt__item">
              {/* Product name column */}
              <span className="receipt__item-name">{item.product.name}</span>
              {/* Qty × unit-price column */}
              <span className="receipt__item-qty">
                {item.quantity} × {peso(item.product.price)}
              </span>
              {/* Line subtotal — rightmost column */}
              <span className="receipt__item-total">{peso(item.subtotal)}</span>
            </div>
          ))}
        </div>

        {/* Horizontal rule between items and financial summary */}
        <div className="receipt__divider" />

        {/* Three-row financial summary: mirrors what the receipt will show.
             Showing this here lets the cashier verify cash ÷ change before
             committing, which is the whole point of this modal. */}
        <div className="receipt__summary">
          <div className="receipt__row">
            <span>Total</span>
            <strong>{peso(total)}</strong>
          </div>
          <div className="receipt__row">
            <span>Cash Given</span>
            {/* Not bold — secondary information, total + change are what matter */}
            <span>{peso(cashNum)}</span>
          </div>
          <div className="receipt__row receipt__row--change">
            <span>Change</span>
            <strong>{peso(change)}</strong>
          </div>
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

  // ── Category Drawer state ──────────────────────────────────
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [drawerSearch,  setDrawerSearch]  = useState('');
  const [selectedCats,  setSelectedCats]  = useState(() => new Set());

  const [loading,    setLoading]    = useState(true);
  const [processing, setProcessing] = useState(false);
  const [receipt,    setReceipt]    = useState(null);
  const [banner,     setBanner]     = useState(null);

  // ── [NEW] Confirm-order modal visibility ───────────────────
  // false → hidden (default)
  // true  → showing order summary, awaiting explicit cashier confirmation
  // The actual checkout() call only fires from inside ConfirmOrderModal.
  const [showConfirm, setShowConfirm] = useState(false); // [NEW] true = show confirm modal; false = hidden (default)

  // ── Derived values ─────────────────────────────────────────
  const total     = cart.reduce((s, i) => s + i.subtotal, 0);
  const cashNum   = parseFloat(cash) || 0;
  const change    = cashNum - total;
  // canCharge gates both the Charge button AND the confirm modal's Confirm button
  const canCharge = cart.length > 0 && cashNum >= total && total > 0;

  const filtered = products.filter(p => {
    const q      = search.toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);

    let matchC;
    if (selectedCats.size > 0) {
      matchC = selectedCats.has(String(p.category_id));
    } else {
      matchC = activeCat === 'all' || String(p.category_id) === activeCat;
    }

    return matchQ && matchC;
  });

  const quickCats    = categories.slice(0, MAX_QUICK_CATS);
  const hasMore      = categories.length > MAX_QUICK_CATS;
  const drawerActive = selectedCats.size > 0;

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
    if (product.stock <= 0) { toast.error('Out of stock'); return; }
    const existing = cart.find(i => i.product.id === product.id);
    if (existing && existing.quantity >= product.stock) { toast.error('Not enough stock'); return; }
    setCart(prev => {
      const idx = prev.findIndex(i => i.product.id === product.id);
      if (idx > -1) {
        const cur = prev[idx].quantity;
        return prev.map((i, n) => n === idx
          ? { ...i, quantity: cur + 1, subtotal: (cur + 1) * i.product.price }
          : i
        );
      }
      return [...prev, { product, quantity: 1, subtotal: +product.price }];
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

  // ── Category filter handlers ────────────────────────────────
  const handleQuickPill = (catId) => {
    setActiveCat(catId);
    setSelectedCats(new Set());
  };

  const toggleDrawerCat = (catId) => {
    setSelectedCats(prev => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
    setActiveCat('all');
  };

  const clearDrawerCats = () => setSelectedCats(new Set());

  // ── Cash input handler ──────────────────────────────────────
  const handleCashChange = (e) => {
    const raw = e.target.value;
    if (raw === '') { setCash(''); return; }
    const num = parseFloat(raw);
    if (!isNaN(num) && num > MAX_CASH_INPUT) {
      setCash(MAX_CASH_INPUT.toFixed(2));
      return;
    }
    setCash(raw);
  };

  // ── Checkout ───────────────────────────────────────────────
  // [CHANGED] This function is no longer called by the Charge button directly.
  // The Charge button now calls setShowConfirm(true), and checkout() is only
  // invoked when the cashier clicks "Confirm & Charge" inside ConfirmOrderModal.
  //
  // [CHANGED] setShowConfirm(false) is called in BOTH the try and catch branches.
  //   - try  → closes confirm modal before opening the receipt modal.
  //             React 18 batches these two setStates so there is no intermediate
  //             render with both modals open simultaneously.
  //   - catch → closes confirm modal so the error banner on the main POS page
  //             is visible. The cart is preserved so the cashier can retry
  //             without rebuilding the order from scratch.
  const checkout = async () => {
    // Defensive guard: canCharge was verified before the confirm modal opened,
    // but this protects against any unexpected call path (e.g. keyboard shortcut).
    if (!canCharge || processing) return;

    setProcessing(true);
    setBanner(null);

    try {
      const res = await api.post('/transactions/index.php', {
        items: cart.map(i => ({
          product_id:   i.product.id,
          product_name: i.product.name,
          product_sku:  i.product.sku || null,
          unit_price:   i.product.price,
          quantity:     i.quantity,
          subtotal:     i.subtotal,
        })),
        total,
        cash_given:    cashNum,
        change_amount: change,
      });

      // Close confirm modal first, then open receipt modal.
      // Ordering matters: if receipt opened while confirm was still mounted,
      // two modals would render simultaneously (stacked backdrops).
      setShowConfirm(false);  // [CHANGED] close confirm modal before opening receipt; prevents two modals stacking
      setReceipt(res.data);
      clearCart();
      loadData();
      toast.success('Transaction saved!');

    } catch (err) {
      // Close confirm modal so the error banner below the product grid
      // is actually visible to the cashier. Cart remains intact.
      setShowConfirm(false);  // [CHANGED] close confirm modal so the error banner on the main page is visible
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
            className={`cat-pill ${activeCat === 'all' && !drawerActive ? 'cat-pill--on' : ''}`}
            onClick={() => handleQuickPill('all')}
          >All</button>

          {quickCats.map(c => (
            <button
              key={c.id}
              className={`cat-pill ${activeCat === String(c.id) ? 'cat-pill--on' : ''}`}
              onClick={() => handleQuickPill(String(c.id))}
            >{c.name}</button>
          ))}

          {hasMore && (
            <button
              className={`cat-more-btn ${drawerActive ? 'cat-more-btn--active' : ''}`}
              onClick={() => setDrawerOpen(true)}
              title="Browse all categories"
            >
              {drawerActive ? `${selectedCats.size} selected` : 'More'}
              <span className="cat-more-chevron" aria-hidden="true">›</span>
            </button>
          )}
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
            <span className="cart-items-count">{cart.reduce((s, i) => s + i.quantity, 0)} item(s)</span>
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
              onChange={handleCashChange}
              min="0"
              max={MAX_CASH_INPUT}
              step="0.01"
            />
          </div>

          {cashNum > 0 && cashNum < total && (
            <p className="cash-short">⚠ Short by {peso(total - cashNum)}</p>
          )}

          {change >= 0 && cashNum > 0 && (
            <div className="cart-change">
              <span>Change</span>
              <strong>{peso(change)}</strong>
            </div>
          )}

          {/* [CHANGED] onClick now opens the confirmation modal instead of
               firing checkout() directly. The API call only happens when
               the cashier explicitly clicks "Confirm & Charge" in that modal.
               The disabled condition is unchanged — canCharge must be true
               and no call can already be in flight.                          */}
          <button
            className="btn-charge"
            onClick={() => setShowConfirm(true)}  // [CHANGED] was: onClick={checkout} — now opens confirm modal; checkout() only fires after explicit confirmation
            disabled={!canCharge || processing}
          >
            <i className="fi fi-sr-bolt"></i>
            {processing ? 'Processing…' : `Charge ${peso(total)}`}
          </button>
        </div>
      </div>

      {/* Receipt modal — opens AFTER a successful transaction */}
      {receipt && (
        <ReceiptModal transaction={receipt} onClose={() => setReceipt(null)} />
      )}

      {/* [NEW] Confirm-order modal — the only path to checkout().
           Rendered after ReceiptModal in the DOM so it sits above it in
           stacking order (though in the normal happy path only one of the
           two is ever open at the same time).
           onCancel leaves the cart and cash untouched so the cashier can
           fix a mistake and re-open the modal without starting over.       */}
      {showConfirm && (  // [NEW] mounts confirm modal only when cashier taps Charge; unmounted after confirm or cancel
        <ConfirmOrderModal
          cart={cart}
          total={total}
          cashNum={cashNum}
          change={change}
          processing={processing}
          onConfirm={checkout}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Category drawer — outside pos-left to avoid overflow:hidden clipping */}
      {drawerOpen && (
        <CategoryDrawer
          categories={categories}
          selectedCats={selectedCats}
          onToggle={toggleDrawerCat}
          onClear={clearDrawerCats}
          onClose={() => { setDrawerOpen(false); setDrawerSearch(''); }}
          drawerSearch={drawerSearch}
          setDrawerSearch={setDrawerSearch}
        />
      )}
    </div>
  );
}