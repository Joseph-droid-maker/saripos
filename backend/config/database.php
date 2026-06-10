<?php
// ── Database Configuration ─────────────────────────────────────
// Edit these values to match your hosting environment.
// XAMPP defaults: host=localhost, user=root, pass=(empty)

define('DB_HOST', 'localhost');
define('DB_USER', 'Joseph');
define('DB_PASS', 'Morada');
define('DB_NAME', 'sari_pos');

function getDB(): mysqli {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if ($conn->connect_error) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'message' => 'Database connection failed: ' . $conn->connect_error
        ]);
        exit;
    }
    $conn->set_charset('utf8mb4');
    return $conn;
}
