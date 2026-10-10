<?php
declare(strict_types=1);
require __DIR__ . '/membres-data.php';
memberSession();
$id = $_GET['id'] ?? '';
if (!is_string($id) || !preg_match('/^[a-f0-9]{24}$/', $id)) {
    http_response_code(404);
    exit;
}
try {
    $config = memberConfig();
    $data = memberData($config);
    $photo = null;
    foreach ($data['players'] as $player) {
        if ($player['id'] !== $id) continue;
        if (memberStaff() || (!empty($player['approved']) && !empty($player['public_profile']))) {
            $photo = $player['photo'] ?? null;
        }
        break;
    }
    if (!is_string($photo) || !preg_match('/^[a-f0-9]{24}\.(jpg|png|webp)$/', $photo)) throw new RuntimeException();
    $path = memberPrivateDir($config) . '/member-photos/' . $photo;
    if (!is_file($path) || is_link($path)) throw new RuntimeException();
    $extension = pathinfo($path, PATHINFO_EXTENSION);
    header('Content-Type: ' . ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$extension]);
    header('Content-Disposition: inline; filename="profile.' . $extension . '"');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
} catch (Throwable $error) {
    http_response_code(404);
}
