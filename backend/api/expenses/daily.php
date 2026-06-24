<?php
// ============================================================
// backend/api/reports/daily.php
// ============================================================
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../middleware/auth.php';

requireAdmin();

$db = getDB();

// ── Input parsing ────────────────────────────────────────────
// Null coalescing operator (??) provides safe defaults when
// query params are absent — no isset() boilerplate needed.
$dateFrom = $_GET['date_from'] ?? date('Y-m-01');
$dateTo   = $_GET['date_to']   ?? date('Y-m-d');

// ── Strict date validation ───────────────────────────────────
// DateTime::createFromFormat is stricter than strtotime().
// strtotime('2026-02-30') silently overflows to March 2 — that's
// a silent data bug. createFromFormat + format re-check catches it:
// e.g. '2026-02-30' parses but re-formats to '2026-03-02', which
// !== the original string, so validation fails correctly.
$fmt    = 'Y-m-d';
$dtFrom = DateTime::createFromFormat($fmt, $dateFrom);
$dtTo   = DateTime::createFromFormat($fmt, $dateTo);

if (
    !$dtFrom || !$dtTo ||
    $dtFrom->format($fmt) !== $dateFrom ||  // catches overflow dates
    $dtTo->format($fmt)   !== $dateTo
) {
    respond(false, ['error' => 'Invalid date format. Use YYYY-MM-DD.']);
    exit;
}

if ($dtFrom > $dtTo) {
    respond(false, ['error' => 'date_from cannot be after date_to.']);
    exit;
}

// ── Sargable upper bound for created_at ──────────────────────
// created_at is a DATETIME/TIMESTAMP column — wrapping it in DATE()
// inside a WHERE clause (DATE(created_at) BETWEEN ...) makes the
// query non-sargable: MySQL cannot use the index on created_at
// because it has to evaluate DATE() on every row first (full scan).
//
// Fix: use a half-open range [dateFrom, exclusive_end) so the raw
// column value is compared directly, keeping the query sargable.
// clone prevents mutating $dtTo, which we still need for expenses.
$dateToExclusive = (clone $dtTo)->modify('+1 day')->format($fmt);

// ── Query 1: Per-day sales breakdown ─────────────────────────
// Parameterized prepared statement — no SQL injection risk.
// Sargable range on created_at (DATETIME), not DATE(created_at).
// GROUP BY DATE(created_at) still works correctly here — the
// function is only applied to already-filtered rows, not during
// the WHERE scan.
$stmt = $db->prepare(
    'SELECT DATE(created_at)  AS date,
            COUNT(*)          AS transaction_count,
            SUM(total)        AS total_sales,
            SUM(item_count)   AS items_sold
     FROM   transactions
     WHERE  created_at >= ? AND created_at < ?
     GROUP  BY DATE(created_at)
     ORDER  BY date DESC'
);
$stmt->bind_param('ss', $dateFrom, $dateToExclusive);
$stmt->execute();
$txRows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

// ── Query 2: Sales period summary ────────────────────────────
// Used for the header cards (total transactions, revenue, avg).
// Same sargable range as Query 1.
$stmt2 = $db->prepare(
    'SELECT COUNT(*)   AS total_transactions,
            SUM(total) AS total_revenue,
            AVG(total) AS avg_transaction
     FROM   transactions
     WHERE  created_at >= ? AND created_at < ?'
);
$stmt2->bind_param('ss', $dateFrom, $dateToExclusive);
$stmt2->execute();
$salesSummary = $stmt2->get_result()->fetch_assoc();
$stmt2->close();

// ── Query 3: Per-day expense breakdown ───────────────────────
// expense_date is a DATE column — BETWEEN on a plain DATE is
// already sargable, no fix needed here.
//
// NULL category fix — three-valued logic in SQL means:
//   NULL != 'Food'  →  NULL  (not TRUE — row is excluded from both buckets)
//
// The guard (category != 'Food' OR category IS NULL) explicitly
// routes NULL rows into other_expenses, so the invariant
//   food_expenses + other_expenses = total_expenses
// holds unconditionally, regardless of data quality.
//
// Note: single quotes for string literals — double quotes break
// if the server ever enables ANSI_QUOTES mode.
$stmt3 = $db->prepare(
    'SELECT expense_date                                                     AS date,
            COALESCE(SUM(amount), 0)                                         AS day_expenses,
            COALESCE(SUM(CASE WHEN category = \'Food\'
                              THEN amount END), 0)                           AS day_food,
            COALESCE(SUM(CASE WHEN category != \'Food\'
                              OR   category IS NULL
                              THEN amount END), 0)                           AS day_other
     FROM   expenses
     WHERE  expense_date BETWEEN ? AND ?
     GROUP  BY expense_date
     ORDER  BY expense_date DESC'
);
$stmt3->bind_param('ss', $dateFrom, $dateTo);
$stmt3->execute();
$expenseRows = $stmt3->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt3->close();

$db->close(); // release connection before PHP-side processing

// ── Build O(1) lookup maps ────────────────────────────────────
// Indexing by date string turns the merge below from O(n²) nested
// loops into O(1) hash-map lookups — one pass each.
$txByDate  = [];
foreach ($txRows as $row) {
    $txByDate[$row['date']] = $row;
}

$expByDate = [];
foreach ($expenseRows as $row) {
    $expByDate[$row['date']] = $row;
}

// ── Generate every calendar date in the range ─────────────────
// DatePeriod + DateInterval is the idiomatic PHP way to enumerate
// a date range. This is the core fix for the "expense-only day
// silently dropped" bug: instead of starting from transaction rows
// and enriching them, we start from the full date spine and pull
// from both lookup maps — so days with expenses but zero sales,
// or fully idle days, always appear.
//
// DatePeriod end is exclusive, so we add 1 day to make $dateTo
// inclusive. $dtTo is already a DateTime from validation above.
$period = new DatePeriod(
    $dtFrom,
    new DateInterval('P1D'),       // step: 1 day
    (clone $dtTo)->modify('+1 day') // inclusive upper bound
);

$dailyRows     = [];
$totalExpenses = 0.0; // accumulators for expense_summary —
$totalFood     = 0.0; // eliminates what was the old Query 3 (redundant round trip)

foreach ($period as $dt) {
    $d = $dt->format($fmt);

    // Null coalescing to null first so we can use a single ?? 0
    // fallback per field rather than repeating it inside the lookup.
    $tx  = $txByDate[$d]  ?? null;
    $exp = $expByDate[$d] ?? null;

    // Explicit casts: SUM() returns strings in MySQLi; cast early
    // so arithmetic below doesn't silently concatenate strings.
    $daySales    = (float)($tx['total_sales']       ?? 0);
    $dayTxCount  = (int)  ($tx['transaction_count'] ?? 0);
    $dayItems    = (int)  ($tx['items_sold']         ?? 0);
    $dayExpenses = (float)($exp['day_expenses']      ?? 0);
    $dayFood     = (float)($exp['day_food']          ?? 0);
    $dayOther    = (float)($exp['day_other']         ?? 0);

    // Running totals — used to build expense_summary below
    // without an extra DB query.
    $totalExpenses += $dayExpenses;
    $totalFood     += $dayFood;

    $dailyRows[] = [
        'date'              => $d,
        'transaction_count' => $dayTxCount,
        'total_sales'       => $daySales,
        'items_sold'        => $dayItems,
        'day_expenses'      => $dayExpenses,
        'day_food'          => $dayFood,
        'day_other'         => $dayOther,
        'net_sales'         => $daySales - $dayExpenses,
    ];
}

// DatePeriod iterates oldest-first; reverse once to get newest-first,
// matching the original sort order the frontend expects.
$dailyRows = array_reverse($dailyRows);

// ── Expense summary ───────────────────────────────────────────
// Derived entirely from the accumulators above — no fourth query.
// other_expenses is computed as total - food (not summed separately)
// so the P&L identity food + other = total is guaranteed by
// arithmetic, not by trusting SQL data quality.
$expenseSummary = [
    'total_expenses' => $totalExpenses,
    'food_expenses'  => $totalFood,
    'other_expenses' => $totalExpenses - $totalFood, // always balances
];

respond(true, [
    'daily'           => $dailyRows,
    'summary'         => $salesSummary,
    'expense_summary' => $expenseSummary,
    'date_from'       => $dateFrom,
    'date_to'         => $dateTo,
]);