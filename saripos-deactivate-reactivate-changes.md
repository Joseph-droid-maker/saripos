# SariPOS — Product Deactivate/Reactivate Implementation

**Feature:** Mirror the existing Users deactivate/reactivate toggle pattern onto Products, so the "Delete" button becomes "Reactivate" when a product's `is_active = 0`.

**Files that need to change: 3.** No new files, no schema changes, no new dependencies.

| # | File | Change | Why |
|---|---|---|---|
| 1 | `backend/api/products/single.php` | `DELETE` becomes a soft-delete; new `PATCH` handler added | Hard delete breaks sales-history JOINs (FK is `ON DELETE SET NULL`); there was also no way back |
| 2 | `backend/api/products/index.php` | `GET` accepts `?status=inactive` (admin only) | Without this, deactivated products are invisible — there's no way to list them to reactivate |
| 3 | `frontend/src/pages/ProductsPage.jsx` | Active/Inactive toggle, conditional action button, conditional confirmation modal | Surfaces the above in the UI, copying the proven pattern already in `UsersPage.jsx` |

`frontend/src/utils/api.js` does **not** need a change — `api.patch()` already exists (confirmed; `UsersPage.jsx` already calls it).

---

## Concepts used in this change

- **Soft delete vs. hard delete** — a data-integrity pattern where a row is flagged inactive instead of removed, preserving foreign-key references for historical reporting.
- **Idempotent guard clauses** — `AND is_active = 1` / `AND is_active = 0` in the `UPDATE` statements ensure calling the endpoint twice doesn't silently misreport success.
- **HTTP method semantics (REST-ish)** — `DELETE` for "remove from active use," `PATCH` for "partial state transition" (reactivate), as opposed to `PUT` (full replace) — same convention already established in `users/single.php`.
- **Parameterized queries (prepared statements)** — `bind_param` throughout; the new code follows the same pattern as the rest of the codebase, no string concatenation into SQL.
- **React state + derived lookups** — `useState`, `useCallback` with dependency arrays, and a derived `.find()` lookup (`toggleProduct`) instead of storing the whole object in state, matching `UsersPage.jsx`'s `toggleUser` pattern.
- **Conditional rendering** — ternaries in JSX to swap button label/icon/color and modal copy based on a single boolean (`is_active`), rather than duplicating markup.
- **Role-gated query parameters** — the backend decides server-side whether `?status=inactive` is honored (`$user['role'] === 'admin'`), so a staff account can't get a different response just by appending a query string client-side.

---

## File 1 — `backend/api/products/single.php`

### 1a. `DELETE` handler: hard delete → soft delete

**BEFORE:**
```php
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    requireAdmin();

    $stmt = $db->prepare('DELETE FROM products WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();

    $affected = $stmt->affected_rows;

    $stmt->close();
    $db->close();

    if (!$affected) {
        respondError('Product not found.', 404);
    }

    respond(true, null, 'Product permanently deleted.');
}
respondError('Method not allowed.', 405);
```

**AFTER:**
```php
// ── DELETE: Deactivate a product (admin only) ──────────────────
// CHANGED: this used to be a hard DELETE. The products table's FK is
// "ON DELETE SET NULL" on transaction_items.product_id — so a hard delete
// nulls out product_id on every past sale of that item, and any report
// that JOINs transaction_items to products (best-sellers, profit totals)
// silently drops those rows. Soft-deleting keeps product_id intact, so
// history stays correct, and the product can be brought back via PATCH.
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    requireAdmin();

    // NEW: "AND is_active = 1" is a guard, not just a filter. It means this
    // statement can only ever affect a row that is currently active. If the
    // product is already inactive, affected_rows comes back 0 and we report
    // 404 instead of pretending a second "delete" did something.
    $stmt = $db->prepare('UPDATE products SET is_active = 0 WHERE id = ? AND is_active = 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();

    $affected = $stmt->affected_rows;

    $stmt->close();
    $db->close();

    if (!$affected) {
        // CHANGED: message reflects the new guard condition above
        respondError('Product not found or already inactive.', 404);
    }

    // CHANGED: was "Product permanently deleted." — it no longer is
    respond(true, null, 'Product deactivated.');
}
```

### 1b. New `PATCH` handler — reactivation (didn't exist before at all)

**BEFORE:** *(nothing — there was no `PATCH` branch in this file)*

**AFTER** — insert directly after the `DELETE` block above, before the final `respondError('Method not allowed.', 405);`:
```php
// ── PATCH: Reactivate a deactivated product (admin only) ───────
// NEW: this entire block. Mirrors the existing PATCH handler in
// users/single.php, which already does the same is_active=1 flip for users.
if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {
    requireAdmin(); // only the admin can bring a product back into circulation

    // Guard: "AND is_active = 0" means this can only succeed on a row that
    // is currently inactive. Calling PATCH on an already-active product
    // reports "not found" instead of silently returning success — slightly
    // more defensive than the equivalent users/single.php PATCH, which
    // doesn't have this guard. Worth backporting there too, but out of
    // scope for this change.
    $stmt = $db->prepare('UPDATE products SET is_active = 1 WHERE id = ? AND is_active = 0');
    $stmt->bind_param('i', $id);

    if (!$stmt->execute()) respondError('Failed to reactivate product.', 500);

    $affected = $stmt->affected_rows; // 0 = guard above didn't match anything
    $stmt->close();
    $db->close();

    if (!$affected) respondError('Product not found or already active.', 404);

    respond(true, null, 'Product reactivated.');
}

respondError('Method not allowed.', 405); // unchanged, just now sits after PATCH too
```

---

## File 2 — `backend/api/products/index.php`

### `GET` handler: hardcoded active-only → admin-toggleable status filter

**BEFORE:**
```php
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $search   = trim($_GET['search'] ?? '');
    $category = intval($_GET['category'] ?? 0);

    $sql    = 'SELECT p.*, c.name AS category_name
               FROM products p
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE p.is_active = 1';
    $params = [];
    $types  = '';

    if ($search) {
        $sql      .= ' AND (p.name LIKE ? OR p.sku LIKE ? Or p.description LIKE ?)';
        $like      = "%$search%";
        $params[]  = $like;
        $params[]  = $like;
        $params[]  = $like;
        $types    .= 'sss';
    }
```

**AFTER:**
```php
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $search   = trim($_GET['search'] ?? '');
    $category = intval($_GET['category'] ?? 0);

    // NEW: staff at the POS must never see deactivated stock, so this only
    // ever evaluates true for an admin — appending ?status=inactive to the
    // URL as a staff account has zero effect, this is checked server-side.
    $showInactive = (($_GET['status'] ?? '') === 'inactive') && $user['role'] === 'admin';

    $sql    = 'SELECT p.*, c.name AS category_name
               FROM products p
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE p.is_active = ?';            // CHANGED: was a hardcoded "= 1"
    $params = [$showInactive ? 0 : 1];             // NEW: bind 0 (inactive) or 1 (active)
    $types  = 'i';                                 // NEW: type for the param above

    if ($search) {
        $sql      .= ' AND (p.name LIKE ? OR p.sku LIKE ? Or p.description LIKE ?)';
        $like      = "%$search%";
        $params[]  = $like;
        $params[]  = $like;
        $params[]  = $like;
        $types    .= 'sss';
    }
```

Everything below this point in the file (`$category` filter, `ORDER BY`, the `POST` handler) is unchanged — `$params`/`$types` are appended to, not replaced, so the existing search/category logic keeps working exactly as before.

---

## File 3 — `frontend/src/pages/ProductsPage.jsx`

All line numbers below refer to the **main `ProductsPage` component** (after `export default function ProductsPage()`), not the separate `CategoryModal` component earlier in the same file, which happens to reuse the name `deleteId` for an unrelated piece of local state — that one is untouched.

### 3a. New state for the tab

**BEFORE:**
```jsx
  const [filterStock, setFilterStock] = useState('all'); 
  const [loading,    setLoading]    = useState(true);
```

**AFTER:**
```jsx
  const [filterStock, setFilterStock] = useState('all'); 
  // NEW: which product set is currently shown — defaults to Active so
  // nothing changes for users who never touch this feature.
  const [filterStatus, setFilterStatus] = useState('active'); // 'active' | 'inactive'
  const [loading,    setLoading]    = useState(true);
```

### 3b. `load()` — pass the status filter to the backend

**BEFORE:**
```jsx
  const load = useCallback(async () => {
    setLoading(true); setBanner(null);
    try {
      const [pr, cr] = await Promise.all([
        api.get('/products/index.php'),
        api.get('/categories/index.php'),
      ]);
      setProducts(pr.data || []);
      setCategories(cr.data || []);
    } catch (err) {
      setBanner({ type: 'error', msg: err.message });
    } finally {
      setLoading(false);
    }
  }, []);
```

**AFTER:**
```jsx
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
  }, [filterStatus]); // CHANGED: was [] — must re-run when the tab switches
```

`useEffect(() => { load(); }, [load]);` further down the file needs **no edit** — it already re-runs whenever `load` itself changes identity, and `useCallback`'s new `[filterStatus]` dependency means `load` gets a new identity every time the tab is switched. The existing effect picks that up automatically.

### 3c. `handleDelete` → `handleToggle`

**BEFORE:**
```jsx
  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await api.delete(`/products/single.php?id=${deleteId}`);
      toast.success('Product deleted.');
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };
```

**AFTER:**
```jsx
  // ── Deactivate / Reactivate ──────────────────────────────────
  // CHANGED: handleDelete is now handleToggle. Same branching logic as
  // UsersPage's handleToggle — call DELETE if currently active, PATCH if not.
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

  // NEW: derived lookup so the confirmation modal can read the product's
  // current is_active state without storing a duplicate copy in state.
  const toggleProduct = products.find(p => p.id === deleteId);
```

*Note: the state variable keeps the name `deleteId` rather than being renamed to match `UsersPage`'s `deactId`. Renaming would touch 7 unrelated lines for a cosmetic gain only — not worth the diff noise for this change.*

### 3d. Filter bar — add the Active/Inactive toggle

**BEFORE** (tail end of the filter bar, right before the result-count span):
```jsx
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

        <span className="filter-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>
```

**AFTER:**
```jsx
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

        {/* NEW: Active/Inactive toggle. Same two-button visual pattern as
            the Stock In/Stock Out toggle inside StockModal earlier in this
            file — reusing an existing convention instead of inventing one.
            Wrapped in isAdmin: staff get active-only no matter what, so
            showing them a control that can't do anything would be confusing. */}
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
```

The `filtered` array further down the file (the `.filter()` block with `matchSearch`/`matchCat`/`matchStock`) needs **no change**. It already operates on whatever `products` currently holds, and `products` now holds either the active set or the inactive set depending on the tab — never both at once — because the backend did that filtering already.

### 3e. Table row action buttons — branch on `is_active`

**BEFORE:**
```jsx
                  {isAdmin && (
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-ghost btn-sm" title="Update Stock" onClick={() => setStockProd(p)}><i className="fi fi-sr-box" /></button>
                        <button className="btn btn-ghost btn-sm" title="Edit Product" onClick={() => openEdit(p)}><i className="fi fi-sr-edit" /></button>
                        <button className="btn btn-danger btn-sm" title="Delete Product" onClick={() => setDeleteId(p.id)}><i className="fi fi-sr-trash" /></button>
                      </div>
                    </td>
                  )}
```

**AFTER:**
```jsx
                  {isAdmin && (
                    <td>
                      <div className="table-actions">
                        {p.is_active ? (
                          // Active product: same three buttons as before, just
                          // the trash button's title/intent is now "Deactivate"
                          <>
                            <button className="btn btn-ghost btn-sm" title="Update Stock" onClick={() => setStockProd(p)}><i className="fi fi-sr-box" /></button>
                            <button className="btn btn-ghost btn-sm" title="Edit Product" onClick={() => openEdit(p)}><i className="fi fi-sr-edit" /></button>
                            <button className="btn btn-danger btn-sm" title="Deactivate Product" onClick={() => setDeleteId(p.id)}><i className="fi fi-sr-trash" /></button>
                          </>
                        ) : (
                          // NEW: inactive product — only Reactivate is offered.
                          // Stock/Edit are deliberately left out: there's no
                          // real use case for restocking or editing a
                          // discontinued item, and skipping them means
                          // restock.php and the PUT handler don't need any
                          // changes for this feature at all.
                          <button className="btn btn-ghost btn-sm" title="Reactivate Product" onClick={() => setDeleteId(p.id)}>
                            <i className="fi fi-sr-rotate-left" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
```

### 3f. Confirmation modal — conditional copy

**BEFORE:**
```jsx
      {/* ── Delete Confirmation ── */}
      <Modal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete Product"
        danger size="sm"
        footer={
          <div className="modal-footer-btns">
            <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete}>Yes, Delete</button>
          </div>
        }
      >
        <p>Are you sure you want to delete this product? This cannot be undone.</p>
      </Modal>
```

**AFTER:**
```jsx
      {/* ── Deactivate / Reactivate Confirmation ── */}
      {/* CHANGED: title, "danger" red styling, button label, and body copy
          are now all conditional on toggleProduct.is_active — same approach
          as the equivalent modal already working in UsersPage.jsx. */}
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
```

---

## Known minor side effects (not fixed here — flagging, not hiding)

These are honest tradeoffs of the minimal-diff approach above, not bugs to silently ignore:

1. **The three stat cards** (`Total Products`, `Low Stock`, `Out of Stock`) at the top of the page compute off `products.length` / `products.filter(...)`. When the Inactive tab is active, these cards will describe the *inactive* set instead of the *active* one — e.g. "Total Products: 1" while looking at one deactivated item. Nothing breaks, but the labels become momentarily misleading. Low priority for a 1-admin store; worth a follow-up only if it causes real confusion in practice.
2. **The Stock filter dropdown** (`In Stock` / `Out of Stock` / `Low Stock`) still applies on the Inactive tab. Combining "Inactive" + "Low Stock" is an odd pairing but causes no error — it just narrows an already-small list further.

Neither of these touches money, stock counts, or auth — they're cosmetic, and fixing them would mean adding `filterStatus`-aware branches to the stat-card calculations, which is more surface area than this feature needs right now.

---

## Manual test checklist before calling this done

1. Deactivate an active product → confirm it disappears from the default (Active) view immediately.
2. Switch to the Inactive tab as admin → confirm the deactivated product appears there, and nowhere else (POS grid, search) shows it.
3. Log in as **staff** → confirm the Inactive toggle button doesn't render at all, and manually hitting `?status=inactive` on the API directly (e.g. via curl with a staff session cookie) still returns the active-only list.
4. Reactivate the product from the Inactive tab → confirm it reappears in the Active tab and in the POS.
5. Deactivate the same product twice in a row (e.g. two admin tabs open) → second attempt should return **404 "already inactive"**, not a silent 200.
6. Pull up a past receipt (Sales page) for a transaction that included a now-deactivated product → confirm the product name/price still display correctly (this was already true before this change, just worth re-confirming nothing regressed).
7. Check the best-selling report still includes a deactivated product's historical sales (this is the entire point of soft-delete over hard-delete — confirm it actually holds).
