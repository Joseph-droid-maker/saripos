<?php
// ── CORS + Session Bootstrap ───────────────────────────────────
// Included at the top of every API endpoint.

$allowed_origins = [
    'http://localhost:5173',   // Vite dev server
    'http://localhost:3000',   // Alternate dev port
    'http://localhost',        // Production XAMPP
    'http://127.0.0.1',

];


date_default_timezone_set('Asia/Manila');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowed_origins, true)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header('Access-Control-Allow-Origin: http://localhost');
}

header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Content-Type: application/json; charset=utf-8');

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Start session (once per request)
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 86400,  // 24 hours
        'path'     => '/',
        'secure' => (
            (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
            (int)($_SERVER['SERVER_PORT'] ?? 80) === 443
        ),
        'httponly' => true,
        'samesite' => 'Lax', // 'Lax' or 'Strict' if not cross-site
    ]);
    session_start();

    if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
}

// Helpers
function respond(bool $success, $data = null, string $message = '', int $code = 200): void {
    http_response_code($code);
    $body = ['success' => $success];
    if ($data !== null) $body['data'] = $data;
    if ($message)       $body['message'] = $message;
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function respondError(string $message, int $code = 400): void {
    respond(false, null, $message, $code);
}

function getBody(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

function verifyCsrf(): void {
    // For JSON requests, the Origin + CORS preflight is sufficient protection.
    // For multipart/form-data (file uploads), we need an explicit token.
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($contentType, 'multipart/form-data') ||
        str_contains($contentType, 'application/x-www-form-urlencoded')) {
        $token = $_POST['csrf_token'] ?? '';
        if (!hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
            respondError('Invalid or missing CSRF token.', 403);
        }
    }
}
