<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../middleware/auth.php';
requireAdmin();
$db = getDB();
$id = intval($_GET['id'] ?? 0);
if (!$id) respondError('User ID is required.');

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body     = getBody();
    $fullName = trim($body['full_name'] ?? '');
    $role     = in_array($body['role'] ?? '', ['admin','staff']) ? $body['role'] : 'staff';
    $isActive = isset($body['is_active']) ? intval($body['is_active']) : 1;
    $password = $body['password'] ?? '';

    if (!$fullName) respondError('Full name is required.');

    if ($password) {
        if (strlen($password) < 6) respondError('Password must be at least 6 characters.');
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $db->prepare('UPDATE users SET full_name=?, role=?, is_active=?, password_hash=? WHERE id=?');
        $stmt->bind_param('ssisi', $fullName, $role, $isActive, $hash, $id);
    } else {
        $stmt = $db->prepare('UPDATE users SET full_name=?, role=?, is_active=? WHERE id=?');
        $stmt->bind_param('ssii', $fullName, $role, $isActive, $id);
    }

    if (!$stmt->execute()) respondError('Failed to update user.', 500);
    $stmt->close();
    $db->close();
    respond(true, null, 'User updated.');
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $stmt = $db->prepare('UPDATE users SET is_active=0 WHERE id=?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    $db->close();
    respond(true, null, 'User deactivated.');
}

respondError('Method not allowed.', 405);
