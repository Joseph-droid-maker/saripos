<?php
// ── Authentication Middleware ──────────────────────────────────

function requireAuth(): array {
    if (empty($_SESSION['user_id'])) {
        respondError('Unauthorized. Please log in.', 401);
    }
    return [
        'id'        => $_SESSION['user_id'],
        'username'  => $_SESSION['username'],
        'full_name' => $_SESSION['full_name'],
        'role'      => $_SESSION['role'],
    ];
}

function requireAdmin(): array {
    $user = requireAuth();
    if ($user['role'] !== 'admin') {
        respondError('Forbidden. Admin access required.', 403);
    }
    return $user;
}
