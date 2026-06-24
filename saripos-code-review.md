# SariPOS — Full Codebase Review

**Reviewed by:** Claude (acting as senior engineer)
**Scope:** Security, Bugs, Business Logic
**Context:** PHP + React POS for a small sari-sari store (1 admin, 2–3 staff)

---

## Summary Table

| Severity | Count | Issues |
|---|---|---|
| 🔴 Critical | 3 | Committed credentials, price trust bypass, missing CSRF on import |
| 🟠 Major | 7 | Duplicate query, stale cart session, stock race, item_count wrong, profit miscalc, etc. |
| 🟡 Minor | 7 | Typos, no rate limiting, uniqid collision, missing .gitignore, etc. |

---

## 🔴 CRITICAL

---

### C-1 — Database Credentials Committed to a Public GitHub Repo

**File:** `backend/config/env.php`, `backend/config/database.php`

**Problem:**

`env.php` is tracked in git and pushed to the public repository. Anyone who visits the repo sees this:

```php
// backend/config/env.php  ← committed, publicly visible
return [
    'DB_HOST' => 'localhost',
    'DB_USER' => 'Joseph',
    'DB_PASS' => 'Morada',   // ← real production password, public
    'DB_NAME' => 'sari_pos',
];
```

The commit message for the "security hardening" commit even says *"Move DB credentials to env.php, out of codebase"* — but then commits `env.php` itself into the codebase. Moving credentials to a file that is still tracked in git accomplishes nothing. The full git history also contains all prior credential values across every previous commit.

Additionally, `database.php` leaks the raw MySQL connection error to the HTTP response:

```php
echo json_encode([
    'message' => 'Database connection failed: ' . $conn->connect_error
    // Exposes: "Access denied for user 'Joseph'@'localhost'" or hostname info
]);
```

**Fix:**

1. **Immediately**: Rotate the database password on the server.
2. Add `backend/config/env.php` to a `.gitignore` file (which doesn't exist at all right now — see Minor M-8).
3. Create `backend/config/env.example.php` with placeholder values and commit that instead.
4. In `database.php`, log the real error server-side and return a generic message to the client:

```php
if ($conn->connect_error) {
    error_log('DB connection failed: ' . $conn->connect_error); // server-side only
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Service temporarily unavailable.']);
    exit;
}
```

---

### C-2 — Server Trusts Client-Submitted Prices (Financial Integrity Bypass) (Done)

**File:** `backend/api/transactions/index.php`

**Problem:**

The checkout endpoint reads `unit_price`, `subtotal`, and `total` directly from the client's POST body and uses them as-is:

```php
// POST body — sent by the browser (or anyone with curl)
$total     = floatval($body['total']         ?? 0);   // ← client controls this
$cashGiven = floatval($body['cash_given']    ?? 0);
$changeAmt = floatval($body['change_amount'] ?? 0);   // ← client controls this

// Inside the item loop:
$unitPrice = floatval($item['unit_price']);  // ← client controls this
$subtotal  = floatval($item['subtotal']);    // ← client controls this
```

The only financial validation that happens is:

```php
if ($cashGiven < $total) respondError('Insufficient cash given.');
```

That check compares two client-controlled values against each other. An attacker (including a dishonest staff member with browser DevTools) can POST:

```json
{
  "items": [
    { "product_id": 5, "product_name": "Coca-Cola", "unit_price": 0.01,
      "quantity": 10, "subtotal": 0.10 }
  ],
  "total": 0.10,
  "cash_given": 1.00, 
  "change_amount": 0.90
}
```

The backend will:
- Pass the `total > 0` check (0.10 > 0 ✓)
- Pass the `cashGiven >= total` check (1.00 >= 0.10 ✓)
- **Deduct 10 units of stock** from the database
- **Record the transaction as ₱0.10** in revenue

Ten Coca-Colas with real cost of ~₱680 are recorded as a ₱0.10 sale. Stock disappears. Revenue is fraudulent. The business loses money with no audit trail.

**Fix:**

The server must look up prices from the database, never trust them from the client. Refactor the POST handler:

```php
// Inside the item loop — look up price from DB, don't trust client
$priceStmt = $db->prepare('SELECT price FROM products WHERE id = ? AND is_active = 1');
$priceStmt->bind_param('i', $productId);
$priceStmt->execute();
$productRow = $priceStmt->get_result()->fetch_assoc();
$priceStmt->close();

if (!$productRow) throw new Exception("Product not found: ID $productId");

$serverUnitPrice = $productRow['price'];
$serverSubtotal  = round($serverUnitPrice * $qty, 2);

// Insert with server-calculated values, not client values
$itemStmt->bind_param('iissdid',
    $txnId, $productId, $productName, $productSku,
    $serverUnitPrice, $qty, $serverSubtotal   
);
```

Then at the end, validate the submitted total against the server-calculated total:

```php
$serverTotal = round(array_sum($serverSubtotals), 2);
if (abs($serverTotal - $clientTotal) > 0.01) {
    throw new Exception("Total mismatch. Expected ₱$serverTotal.");
}
```

`change_amount` must also be calculated server-side as `$cashGiven - $serverTotal`.

---

### C-3 — import.php Missing CSRF Validation Despite Handling multipart/form-data

**File:** `backend/api/products/import.php`
**Reference:** `backend/api/products/upload.php`, `backend/config/cors.php`

**Problem:**

The `cors.php` comment correctly explains the protection model:

```php
function verifyCsrf(): void {
    // For JSON requests, the Origin + CORS preflight is sufficient protection.
    // For multipart/form-data (file uploads), we need an explicit token.
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($contentType, 'multipart/form-data') || ...) {
        $token = $_POST['csrf_token'] ?? '';
        if (!hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
            respondError('Invalid or missing CSRF token.', 403);
        }
    }
}
```

`upload.php` correctly calls `verifyCsrf()`. The commit message even claims both were fixed. But `import.php` does not call it:

```php
// upload.php ✓
requireAdmin();
verifyCsrf();   // ← called

// import.php ✗
requireAdmin();
// verifyCsrf() is never called here — the fix was never applied
```

The frontend sends `csrf_token` in the FormData for import, but the backend ignores it entirely.

With `SameSite=Lax` cookies, a cross-origin POST with `multipart/form-data` submitted via a plain HTML form (not `fetch`) will still include the session cookie. This is the exact threat `verifyCsrf()` guards against for non-JSON requests.

**Fix:**

Add one line immediately after `requireAdmin()` in `import.php`:

```php
requireAdmin();
verifyCsrf();  // ← add this
```

---

## 🟠 MAJOR

---

### M-1 — Duplicate UPDATE Statement in users/single.php DELETE Handler

**File:** `backend/api/users/single.php`

**Problem:**

The DELETE handler prepares and executes the same `UPDATE` query twice, and the first statement handle is never closed:

```php
$stmt = $db->prepare('UPDATE users SET is_active = 0 WHERE id = ?');
$stmt->bind_param('i', $id);
if (!$stmt->execute()) respondError('Failed to deactivate user.', 500);
// ← $stmt handle is leaked here, never closed

$stmt = $db->prepare('UPDATE users SET is_active=0 WHERE id=?'); // identical query
$stmt->bind_param('i', $id);
$stmt->execute();  // runs a second time
$stmt->close();
```

The deactivation runs twice. The first statement handle is never closed (resource leak). This appears to be a copy-paste artifact from an edit where the error-handling guard was added but the original execute block was left in.

**Fix:** Remove the duplicate. Keep the first block with the error check, and add `$stmt->close()`:

```php
$stmt = $db->prepare('UPDATE users SET is_active = 0 WHERE id = ?');
$stmt->bind_param('i', $id);
if (!$stmt->execute()) respondError('Failed to deactivate user.', 500);
$stmt->close();  // ← add this
$db->close();
respond(true, null, 'User deactivated.');
```

---

### M-2 — Typo in User Update Success Message (DONE)

**File:** `backend/api/users/single.php`, line where PUT responds

**Problem:**

```php
respond(true, null, 'User updatedsdadsa.');
//                         ^^^^^^^^^^^^^ debug artifact in production
```

**Fix:** `respond(true, null, 'User updated.');`

---

### M-3 — Previous User's Cart Persists After Logout (DONE)

**File:** `frontend/src/context/AuthContext.jsx`

**Problem:**

The `logout()` function clears React state but does not clear `sessionStorage`:

```js
const logout = async () => {
    try { await api.post('/auth/logout.php', {}); } catch { /* ignore */ }
    setUser(null);
    setCsrfToken('');
    // ← sessionStorage.removeItem('pos_cart') is missing
    // ← sessionStorage.removeItem('pos_cash') is missing
};
```

`POSPage` initializes cart and cash from `sessionStorage` on mount:

```js
const [cart, setCart] = useState(() => {
    const saved = sessionStorage.getItem('pos_cart');
    return saved ? JSON.parse(saved) : [];
});
```

Scenario: Staff A builds a cart of ₱400 worth of items. A manager logs them out and logs in as the admin to check reports, then logs out. Staff B logs in on the same tab. Staff B's POS loads with Staff A's cart already populated. If Staff B doesn't notice, they could process a sale that credits the wrong transaction to themselves, or clear someone else's in-progress order.

**Fix:**

```js
const logout = async () => {
    try { await api.post('/auth/logout.php', {}); } catch { /* ignore */ }
    setUser(null);
    setCsrfToken('');
    sessionStorage.removeItem('pos_cart');  // ← add
    sessionStorage.removeItem('pos_cash');  // ← add
};
```

---

### M-4 — Race Condition (TOCTOU) in restock.php Stock-Out

**File:** `backend/api/products/restock.php`

**Problem:**

The stock-out path performs a check-then-act across two separate queries with no wrapping transaction and no atomic guard:

```php
// Step 1 — read stock (no lock)
$check = $db->prepare('SELECT stock FROM products WHERE id = ? AND is_active = 1');
$check->execute();
$product = $check->get_result()->fetch_assoc();

if ($product['stock'] < $quantity) respondError("Not enough stock...");

// ← another request could run here and deplete stock

// Step 2 — deduct (no AND stock >= ? guard)
$stmt = $db->prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
$stmt->execute();
// stock can go negative if two requests pass Step 1 simultaneously
```

The checkout endpoint (`transactions/index.php`) does this correctly with `AND stock >= ?` and an `affected_rows` check. The restock endpoint doesn't.

**Fix:** Apply the same atomic pattern used in checkout:

```php
// For stock-out: replace the two-step approach with one atomic UPDATE
$stmt = $db->prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ? ');
$stmt->bind_param('iii', $quantity, $productId, $quantity);
$stmt->execute();

if ($stmt->affected_rows === 0) {

    $diag = $db->prepare('SELECT stock, is_active FROM products WHERE id = ?');
    $diag->bind_param('i', $productId);
    $diag->execute();
    $row = $diag->get_result()->fetch_assoc();

    if (!$row) {
        respondError("Product not found.");
    } elseif (!$row['is_active']) {
        respondError("Product is no longer active.");
    } else {
        respondError("Not enough stock. It may have just been sold.");
    }
}
```

You can still do the initial SELECT for returning the product name in the error message, but the actual deduction must use the atomic guard.

---

### M-5 — item_count Stores Product Type Count, Not Total Units Sold

**File:** `backend/api/transactions/index.php`

**Problem:**

```php
$itemCount = count($items);  // ← number of distinct product types in the cart
```

If a customer buys 5 Coca-Colas and 3 bags of chips, `$itemCount = 2` (two distinct products), not `8` (total units). This value is stored in `transactions.item_count` and aggregated in the daily report:

```sql
-- daily.php
SUM(item_count) AS items_sold   -- ← sums product type counts, not actual units
```

`items_sold` in reports becomes meaningless as a business metric. The frontend cart footer correctly shows `cart.reduce((s,i) => s+i.quantity, 0)` but the database stores a different (incorrect) interpretation.

**Fix:**

```php
// Sum quantities across all items, not count of item types
$itemCount = array_sum(array_map(fn($item) => intval($item['quantity']), $items));
```

---

### M-6 — Profit in Best-Selling Report Uses Current Cost Price, Not Historical

**File:** `backend/api/reports/best_selling.php`

**Problem:**

```sql
MAX(p.cost_price)                                 AS cost_price,
SUM(ti.quantity) * MAX(COALESCE(p.cost_price,0))  AS total_cost,
SUM(ti.subtotal) - SUM(ti.quantity) * MAX(COALESCE(p.cost_price,0)) AS profit
```

This joins `transaction_items` (historical sales) against the current `products.cost_price`. If the cost price of a product has changed — say, Coca-Cola went from ₱40 to ₱50 per unit due to a supplier price increase — then all historical sales of Coca-Cola are retroactively recalculated using the new ₱50 cost. Past profit reports change whenever you update a product's cost. This is financially incorrect.

A secondary issue: `MAX(p.cost_price)` is used in a group aggregate. If the JOIN returns multiple rows per product (unlikely with a LEFT JOIN on `id`, but semantically odd), `MAX` is not the right aggregate for cost.

**Immediate fix:** Store `cost_price` in `transaction_items` at checkout time (the same way `unit_price` is stored). The schema already has the column pattern established.

```php
// In the checkout loop — look up cost_price too (after fixing C-2)
$costPrice = $productRow['cost_price'] ?? 0;
// INSERT into transaction_items with cost_price column
```

Until the schema is updated, add a visible disclaimer in the reports UI: "Profit figures use current cost prices and may not reflect historical accuracy."

---

### M-7 — "Revenue (this page)" Stat Card Is Misleading and Functionally Useless

**File:** `frontend/src/pages/SalesPage.jsx`

**Problem:**

```js
const pageRevenue = rows.reduce((s, t) => s + parseFloat(t.total), 0);
// rows = current page of transactions (up to 50)
```

The stat card labeled **"Revenue (this page)"** sums only the 50 transactions visible on the current page. If there are 200 transactions in the date range, the admin sees a different revenue figure every time they change pages. A store owner looking at this assumes it shows total revenue for the selected date range. The label is technically honest but practically deceptive for non-technical users.

The backend already returns the total transaction count. Adding a `SUM(total)` for the date range is a one-line SQL addition.

**Fix:** Add a `total_revenue` field to the GET `/transactions` response from the backend, and display that instead:

```sql
-- In transactions/index.php GET
SELECT COUNT(*) AS total, SUM(total) AS total_revenue FROM transactions WHERE ...
```

```js
// SalesPage
const [totalRevenue, setTotalRevenue] = useState(0);
// on load: setTotalRevenue(res.data.total_revenue || 0)
```

---

## 🟡 MINOR

---

### m-1 — SQL Keyword Mixed Capitalization (`Or` instead of `OR`) (DONE)

**File:** `backend/api/products/index.php`

```php
$sql .= ' AND (p.name LIKE ? OR p.sku LIKE ? Or p.description LIKE ?)';
//                                              ^^ should be OR
```

MySQL is case-insensitive for keywords, so this doesn't cause a bug. But it's a sloppy inconsistency that looks like an unfinished edit.

**Fix:** `OR p.description LIKE ?`

---

### m-2 — PUT in products/single.php Returns 200 When No Row Was Updated

**File:** `backend/api/products/single.php`

```php
$stmt->execute();
// No affected_rows check here
$stmt->close();

// Proceeds to SELECT regardless — returns null product with "Product updated." message
$stmt2->execute();
$product = $stmt2->get_result()->fetch_assoc();  // null if ID doesn't exist
respond(true, $product, 'Product updated.');     // 200 OK with null data
```

If the product ID doesn't exist or is inactive, the `UPDATE` affects 0 rows, but the response is still `200 OK "Product updated."` with `null` as the data payload. The frontend will likely break trying to use a null product.

**Fix:** After `$stmt->close()`:

```php
if ($stmt->affected_rows === 0) respondError('Product not found or already inactive.', 404);
```

---

### m-3 — No Rate Limiting on Login Endpoint

**File:** `backend/api/auth/login.php`

No brute force protection. An attacker can send unlimited POST requests with different passwords. For a local network POS this is low risk, but if the machine is ever accidentally internet-accessible, the admin account (single point of failure) becomes trivially brute-forceable.

**Fix (minimal):** Track failed attempts in `$_SESSION` and add a delay:

```php
$_SESSION['login_attempts'] = ($_SESSION['login_attempts'] ?? 0) + 1;
if ($_SESSION['login_attempts'] > 5) {
    sleep(2);  // progressive delay
    respondError('Too many failed attempts. Try again shortly.', 429);
}
// Reset on success
unset($_SESSION['login_attempts']);
```

---

### m-4 — import.php `affected_rows === 1` Miscounts Unchanged ON DUPLICATE KEY Rows

**File:** `backend/api/products/import.php`

```php
if ($stmt->affected_rows === 1) $inserted++;
else $updated++;
```

With `ON DUPLICATE KEY UPDATE`, MySQL `affected_rows` returns:
- `1` → new row inserted
- `2` → existing row was updated  
- `0` → existing row found but values were identical (no change made)

The current code counts `0` as `$updated++`, so if you import the same file twice in overwrite mode, every unchanged product is reported as "updated" when nothing actually changed.

**Fix:**

```php
$ar = $stmt->affected_rows;
if ($ar === 1)     $inserted++;
elseif ($ar === 2) $updated++;
else               $skipped++;   // 0 = no change, not an update
```

---

### m-5 — Hardcoded Store Name in Receipt

**File:** `frontend/src/pages/POSPage.jsx`

```jsx
<p className="receipt__store">Jing-Jing Store</p>
```

Any store that uses this codebase, or even a name change for Jing-Jing Store, requires a code edit and redeployment. The CSV import template also hardcodes `Jing-Jing_template.csv` as the download filename.

**Fix:** Extract to a constant at the top of the file or a config module:

```js
// frontend/src/utils/config.js
export const STORE_NAME = 'Jing-Jing Store';
```

---

### m-6 — `uniqid()` Suffix for Transaction Codes Has Collision Risk

**File:** `backend/api/transactions/index.php`

```php
$txnCode = 'TXN-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5));
```

`uniqid()` is microsecond-based. The last 5 hex characters of a microsecond timestamp have low but non-zero collision probability under concurrent requests. For a single-cashier store, this is virtually impossible to trigger. But it's an easy fix.

**Fix:**

```php
$txnCode = 'TXN-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
// random_bytes(3) = 6 hex chars, cryptographically random
```

---

### m-7 — `getDB()` Called Before Auth Check in transactions/index.php

**File:** `backend/api/transactions/index.php`

```php
$db = getDB();          // ← DB connection opened for ALL requests

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    requireAdmin();     // ← auth checked AFTER connection
```

Every unauthenticated request — including 401s and method-not-allowed hits — opens a MySQL connection before authentication rejects it. The connection is implicitly abandoned when PHP exits. Not exploitable in itself, but it's wasteful and represents wrong ordering of concerns.

**Fix:** Move `$db = getDB()` inside each method block, after the auth call:

```php
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    requireAdmin();
    $db = getDB();  // ← only open connection once we know the request is authorized
    ...
}
```

---

### m-8 — No .gitignore Exists in the Repository

**Root of repo**

The repository has no `.gitignore`. As a result:
- `env.php` with real credentials was committed (see C-1)
- `frontend/node_modules/` (116 MB) was committed to the repo
- Build artifacts and editor files are unprotected

**Fix:** Create `.gitignore`:

```gitignore
# Credentials — never commit
backend/config/env.php

# Node
frontend/node_modules/
frontend/dist/
dist/

# Build output
*.log
.DS_Store
Thumbs.db
```

Then remove `node_modules` and `env.php` from tracking:

```bash
git rm -r --cached frontend/node_modules/
git rm --cached backend/config/env.php
git commit -m "chore: remove node_modules and env.php from tracking"
```

---

## Fix Priority Order

For a real-world store running on this codebase today:

1. **Right now:** Rotate the database password (C-1 — the current one is public)
2. **Before next transaction:** Fix server-side price calculation (C-2 — direct financial risk)
3. **Before next import:** Add `verifyCsrf()` to `import.php` (C-3)
4. **This week:** M-1 through M-4 (bugs with data integrity consequences)
5. **Next sprint:** M-5 through M-7 and all Minors (reporting accuracy and cleanup)

---

*End of review. Total files inspected: 18. Issues found: 17.*
