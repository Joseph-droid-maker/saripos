<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../middleware/auth.php';

$user = requireAuth();
$db   = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo   = $_GET['date_to']   ?? '';
    $limit    = min(intval($_GET['limit'] ?? 50), 200);
    $offset   = intval($_GET['offset'] ?? 0);

    $sql = 'SELECT * FROM transactions WHERE 1=1';
    $params = []; $types = '';

    if ($dateFrom) { $sql .= ' AND DATE(created_at) >= ?'; $params[] = $dateFrom; $types .= 's'; }
    if ($dateTo)   { $sql .= ' AND DATE(created_at) <= ?'; $params[] = $dateTo;   $types .= 's'; }

    $countStmt = $db->prepare(str_replace('SELECT *', 'SELECT COUNT(*) AS total', $sql));
    if ($params) $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $total = $countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    $sql .= ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    $params[] = $limit; $params[] = $offset; $types .= 'ii';
    $stmt = $db->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close(); $db->close();
    respond(true, ['transactions' => $rows, 'total' => (int)$total, 'limit' => $limit, 'offset' => $offset]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body      = getBody();
    $items     = $body['items']         ?? [];
    $total     = floatval($body['total']        ?? 0);
    $cashGiven = floatval($body['cash_given']   ?? 0);
    $changeAmt = floatval($body['change_amount'] ?? 0);

    if (empty($items))       respondError('Cart cannot be empty.');
    if ($total <= 0)         respondError('Invalid total amount.');
    if ($cashGiven < $total) respondError('Insufficient cash given.');

    $txnCode     = 'TXN-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5));
    $cashierName = $user['full_name'];
    $itemCount   = count($items);

    $db->begin_transaction();
    try {
        $stmt = $db->prepare(
            'INSERT INTO transactions (transaction_code, cashier_id, cashier_name, total, cash_given, change_amount, item_count)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sisdddi', $txnCode, $user['id'], $cashierName, $total, $cashGiven, $changeAmt, $itemCount);
        $stmt->execute();
        $txnId = $stmt->insert_id;
        $stmt->close();

        foreach ($items as $item) {
            $productId   = intval($item['product_id']);
            $productName = trim($item['product_name']);
            $productSku  = $item['product_sku'] ?? null;
            $unitPrice   = floatval($item['unit_price']);
            $qty         = intval($item['quantity']);
            $subtotal    = floatval($item['subtotal']);
            if ($qty <= 0) continue;

            $stockStmt = $db->prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
            $stockStmt->bind_param('iii', $qty, $productId, $qty);
            $stockStmt->execute();
            if ($stockStmt->affected_rows === 0) throw new Exception("Insufficient stock for: $productName");
            $stockStmt->close();

            $itemStmt = $db->prepare(
                'INSERT INTO transaction_items (transaction_id,product_id,product_name,product_sku,unit_price,quantity,subtotal)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $itemStmt->bind_param('iissdid', $txnId, $productId, $productName, $productSku, $unitPrice, $qty, $subtotal);
            $itemStmt->execute();
            $itemStmt->close();
        }

        $db->commit();

        $stmt2 = $db->prepare('SELECT * FROM transactions WHERE id = ?');
        $stmt2->bind_param('i', $txnId);
        $stmt2->execute();
        $txn = $stmt2->get_result()->fetch_assoc();
        $stmt2->close();

        $stmt3 = $db->prepare('SELECT * FROM transaction_items WHERE transaction_id = ?');
        $stmt3->bind_param('i', $txnId);
        $stmt3->execute();
        $txn['items'] = $stmt3->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt3->close(); $db->close();

        respond(true, $txn, 'Transaction saved.', 201);
    } catch (Exception $e) {
        $db->rollback(); $db->close();
        respondError($e->getMessage(), 422);
    }
}

respondError('Method not allowed.', 405);
