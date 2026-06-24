<?php

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../middleware/auth.php';


$currentUser = requireAdmin();
$db = getDB();

$id = intval($_GET['id'] ?? 0);
if (!$id) respondError('User ID is required.');

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $body     = getBody();
    $fullName = trim($body['full_name'] ?? '');
    $role     = in_array($body['role'] ?? '', ['admin','staff']) ? $body['role'] : 'staff';
    $password = $body['password'] ?? '';

    if (!$fullName) respondError('Full name is required.');

    if ($password) {
        if (strlen($password) < 6) respondError('Password must be at least 6 characters.');
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $db->prepare('UPDATE users SET full_name=?, role=?, password_hash=? WHERE id=?');
        $stmt->bind_param('sssi', $fullName, $role,  $hash, $id);
    } else {
        $stmt = $db->prepare('UPDATE users SET full_name=?, role=? WHERE id=?');
        $stmt->bind_param('ssi', $fullName, $role, $id);
    }

    if (!$stmt->execute()) respondError('Failed to update user.', 500);
    $stmt->close();
    $db->close();
    respond(true, null, 'User updated.');
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    // Guard 1: Prevent admins from deactivating their own account
    if ((int)$id === (int)$currentUser['id']) {
        $db->close();
        respondError('You cannot deactivate your own account.', 400);
    }

    // Guard 2: Prevent deactivating the last remaining active admin
    $adminCheck = $db->prepare(
        'SELECT COUNT(*) AS cnt FROM users
         WHERE role = "admin" AND is_active = 1 AND id != ?'
    );
    $adminCheck->bind_param('i', $id);
    $adminCheck->execute();
    $remaining = (int) $adminCheck->get_result()->fetch_assoc()['cnt'];
    $adminCheck->close();

    if ($remaining === 0) {
        $db->close();
        respondError('Cannot deactivate the last active admin account.', 400);
    }

    $stmt = $db->prepare('UPDATE users SET is_active = 0 WHERE id = ?');
    $stmt->bind_param('i', $id);
    
    if (!$stmt->execute()) respondError('Failed to deactivate user.', 500);

    $stmt = $db->prepare('UPDATE users SET is_active=0 WHERE id=?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    $db->close();
    respond(true, null, 'User deactivated.');
}

// ── PATCH ── Reactivate: set is_active = 1
// No guard needed — reactivating a user can never reduce admin count
if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {

    $stmt = $db->prepare('UPDATE users SET is_active = 1 WHERE id = ?');
    $stmt->bind_param('i', $id);

    if (!$stmt->execute()) respondError('Failed to reactivate user.', 500);

    $stmt->close();
    $db->close();
    respond(true, null, 'User reactivated.');
}



respondError('Method not allowed.', 405);