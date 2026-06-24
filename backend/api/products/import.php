<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../middleware/auth.php';

requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respondError('Method not allowed.', 405);
if (empty($_FILES['csv'])) respondError('No file uploaded.');

$mode = in_array($_POST['mode'] ?? '', ['skip', 'overwrite']) ? $_POST['mode'] : 'skip';

$file = $_FILES['csv'];
if ($file['error'] !== UPLOAD_ERR_OK) respondError('Upload error: ' . $file['error']);

$handle = fopen($file['tmp_name'], 'r');
if (!$handle) respondError('Could not read file.', 500);

$db = getDB();

// Pre-load categories for name→id matching
$catResult  = $db->query("SELECT id, LOWER(TRIM(name)) AS name FROM categories");
$categories = [];
while ($row = $catResult->fetch_assoc()) {
    $categories[$row['name']] = $row['id'];
}

// ── Flexible column name mapping ──────────────────────────────
$col_aliases = [
    'name'        => ['item name', 'name', 'product name', 'item', 'product'],
    'description' => ['description/size', 'description', 'size', 'desc', 'variant'],
    'stock'       => ['current stock', 'stock', 'current', 'qty', 'quantity'],
    'cost_price'  => ['cost price', 'cost', 'buying price', 'purchase price', 'cp'],
    'price'       => ['retail price', 'retail', 'selling price', 'price', 'rp', 'srp'],
    'sku'         => ['sku', 'barcode', 'code', 'item code'],
    'category'    => ['category', 'cat', 'type', 'group'],
];

$rawHeader = fgetcsv($handle);
if (!$rawHeader) { $db->close(); respondError('Empty file.'); }
$header = array_map(fn($h) => strtolower(trim($h)), $rawHeader);

$col = [];
foreach ($col_aliases as $field => $aliases) {
    foreach ($aliases as $alias) {
        $idx = array_search($alias, $header);
        if ($idx !== false) { $col[$field] = $idx; break; }
    }
}

if (!isset($col['name']))  { $db->close(); respondError("Could not find a name column. Headers found: "  . implode(', ', $header)); }
if (!isset($col['price'])) { $db->close(); respondError("Could not find a price column. Headers found: " . implode(', ', $header)); }

$inserted = 0; $updated = 0; $skipped = 0; $errors = []; $rowNum = 1;

while (($row = fgetcsv($handle)) !== false) {
    $rowNum++;
    $name = trim($row[$col['name']] ?? '');
    if (!$name) { $skipped++; continue; } // Skip blank rows

    $price     = floatval(str_replace(['₱', ',', ' '], '', $row[$col['price']]     ?? 0));

    $costPrice = isset($col['cost_price'])  ? floatval(str_replace(['₱', ',', ' '], '', $row[$col['cost_price']]  ?? 0)) : 0;
    $stock     = isset($col['stock'])       ? intval($row[$col['stock']]                                          ?? 0) : 0;
    $sku       = isset($col['sku'])         ? trim($row[$col['sku']]                                              ?? '') : null;
    $desc      = isset($col['description']) ? trim($row[$col['description']]                                      ?? '') : null;
    $catName   = isset($col['category'])    ? strtolower(trim($row[$col['category']]                              ?? '')) : '';

    if ($price <= 0) { 
        $errors[] = "Row $rowNum ($name): invalid price."; 
        $skipped++; 
        continue; 
    }

    if ($stock < 0) {
        $errors[] = "Row $rowNum ($name): negative stock value ($stock) is not allowed.";
        $skipped++;
        continue;
    }

    $catId = $catName ? ($categories[$catName] ?? null) : null;

    $sku   = ($sku && $sku !== '')   ? $sku : null;
    $desc  = ($desc && $desc !== '') ? $desc : null;

    if ($sku) {
        if ($mode === 'skip') {
            $chk = $db->prepare('SELECT id FROM products WHERE sku = ? LIMIT 1');
            $chk->bind_param('s', $sku);
            $chk->execute();
            $exists = $chk->get_result()->fetch_assoc();
            $chk->close();
            if ($exists) { $skipped++; continue; }

            $stmt = $db->prepare(
                'INSERT INTO products (name, description, sku, price, cost_price, stock, category_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->bind_param('sssddii', $name, $desc, $sku, $price, $costPrice, $stock, $catId);
        } else {
          
            $stmt = $db->prepare(
                'INSERT INTO products (name, description, sku, price, cost_price, stock, category_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   name=VALUES(name), description=VALUES(description),
                   price=VALUES(price), cost_price=VALUES(cost_price),
                   stock=stock + VALUES(stock),
                   category_id=VALUES(category_id), is_active=1'
            );
            $stmt->bind_param('sssddii', $name, $desc, $sku, $price, $costPrice, $stock, $catId);
        }
    } else {
        
        $chk = $db->prepare(
            'SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND is_active = 1 LIMIT 1'
        );
        $chk->bind_param('s', $name);
        $chk->execute();
        $existing = $chk->get_result()->fetch_assoc();
        $chk->close();

        if ($mode === 'skip') {
            if ($existing) { $skipped++; continue; }

            $stmt = $db->prepare(
                'INSERT INTO products (name, description, price, cost_price, stock, category_id)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $stmt->bind_param('ssddii', $name, $desc, $price, $costPrice, $stock, $catId);
        } else {
            if ($existing) {
                
                $stmt = $db->prepare(
                    'UPDATE products
                     SET description=?, price=?, cost_price=?, stock=stock+?, category_id=?
                     WHERE id=?'
                );
                $stmt->bind_param('sddiii', $desc, $price, $costPrice, $stock, $catId, $existing['id']);
            } else {
                
                $stmt = $db->prepare(
                    'INSERT INTO products (name, description, price, cost_price, stock, category_id)
                     VALUES (?, ?, ?, ?, ?, ?)'
                );
                $stmt->bind_param('ssddii', $name, $desc, $price, $costPrice, $stock, $catId);
            }
        }
    }

    if ($stmt->execute()) {
        if ($stmt->affected_rows === 1) $inserted++;
        else $updated++;
    } else {
        $errors[] = "Row $rowNum ($name): " . $db->error;
        $skipped++;
    }
    $stmt->close();
}

fclose($handle);
$db->close();

respond(true, [
    'inserted' => $inserted,
    'updated'  => $updated,
    'skipped'  => $skipped,
    'errors'   => $errors,
    'mode'     => $mode,
], "Import complete ({$mode} mode). Added: $inserted, Updated: $updated, Skipped: $skipped.");