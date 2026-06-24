<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../middleware/auth.php';
requireAdmin();
$db = getDB();
$dateFrom = $_GET['date_from'] ?? date('Y-m-01');
$dateTo   = $_GET['date_to']   ?? date('Y-m-d');
$stmt = $db->prepare(
    'SELECT DATE(created_at) AS date, COUNT(*) AS transaction_count,
     SUM(total) AS total_sales, SUM(item_count) AS items_sold
     FROM transactions WHERE DATE(created_at) BETWEEN ? AND ?
     GROUP BY DATE(created_at) ORDER BY date DESC'
);
$stmt->bind_param('ss', $dateFrom, $dateTo);
$stmt->execute();
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();
$stmt2 = $db->prepare(
    'SELECT COUNT(*) AS total_transactions, SUM(total) AS total_revenue, AVG(total) AS avg_transaction
     FROM transactions WHERE DATE(created_at) BETWEEN ? AND ?'
);
$stmt2->bind_param('ss', $dateFrom, $dateTo);
$stmt2->execute();
$summary = $stmt2->get_result()->fetch_assoc();
$stmt2->close();
$db->close();
respond(true, ['daily' => $rows, 'summary' => $summary, 'date_from' => $dateFrom, 'date_to' => $dateTo]);


