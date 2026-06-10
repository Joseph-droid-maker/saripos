<?php
require_once __DIR__ . '/../../config/cors.php';

session_destroy();
respond(true, null, 'Logged out successfully.');
