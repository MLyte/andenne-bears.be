<?php

declare(strict_types=1);

require_once __DIR__ . '/private-backup.php';

ini_set('session.use_strict_mode', '1');
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

function reply(int $code, string $message, array $extra = []): never
{
    http_response_code($code);
    echo json_encode(['success' => $code < 300, 'message' => $message] + $extra, JSON_UNESCAPED_UNICODE);
    exit;
}

function input(string $name, int $max): string
{
    $raw = $_POST[$name] ?? '';
    if (!is_string($raw) || strlen($raw) > $max * 4 || !preg_match('//u', $raw)) {
        reply(422, 'Un champ est invalide.');
    }
    $value = trim(preg_replace('/\s+/u', ' ', $raw) ?? '');
    if (preg_match_all('/./us', $value) > $max || preg_match('/[\x00-\x1F\x7F]/', $value)) {
        reply(422, 'Un champ est trop long ou invalide.');
    }
    return $value;
}

function safeCsv(string $value): string
{
    return preg_match('/^[=+\-@]/', $value) ? "'" . $value : $value;
}

$configFile = __DIR__ . '/config/family-day-config.php';
if (!is_file($configFile)) reply(503, 'Inscriptions temporairement indisponibles.');
$config = require $configFile;
$directory = is_array($config) ? ($config['storage_dir'] ?? '') : '';
$private = is_string($directory) ? realpath($directory) : false;
$webRoot = realpath(__DIR__);
if ($private === false || $webRoot === false || !is_writable($private)
    || str_starts_with($private . DIRECTORY_SEPARATOR, $webRoot . DIRECTORY_SEPARATOR)) {
    reply(503, 'Stockage privé indisponible.');
}
$csv = $private . DIRECTORY_SEPARATOR . 'camp-blegny-2026.csv';
if (is_link($csv)) reply(503, 'Stockage privé indisponible.');

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['csrf'])) {
    $_SESSION['camp_csrf'] = bin2hex(random_bytes(32));
    $_SESSION['camp_started'] = time();
    reply(200, 'Formulaire disponible.', ['csrfToken' => $_SESSION['camp_csrf']]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, 'Méthode non autorisée.');
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 12000) reply(413, 'Formulaire trop volumineux.');
if ((int) ($_SESSION['camp_last_submit'] ?? 0) > time() - 10) reply(429, 'Patiente quelques secondes avant un nouvel envoi.');
$token = input('csrf_token', 64);
if ($token === '' || empty($_SESSION['camp_csrf']) || !hash_equals($_SESSION['camp_csrf'], $token)) {
    reply(403, 'Session expirée. Recharge la page.');
}
if (time() - (int) ($_SESSION['camp_started'] ?? time()) < 2) reply(422, 'Patiente un instant avant de confirmer.');
unset($_SESSION['camp_csrf'], $_SESSION['camp_started']);
if (input('website', 150) !== '') reply(200, 'Inscription reçue.');

$lastName = input('last_name', 100);
$firstName = input('first_name', 100);
$role = input('role', 20);
$noLodging = input('no_lodging', 3);
$diet = input('diet', 1000);
$allergies = input('allergies', 1000);
$other = input('other', 1000);
if (preg_match_all('/./us', $lastName) < 2 || preg_match_all('/./us', $firstName) < 2
    || !preg_match('/\p{L}/u', $lastName) || !preg_match('/\p{L}/u', $firstName)
    || !in_array($role, ['Junior', 'Senior', 'Staff'], true) || !in_array($noLodging, ['', 'oui'], true)) {
    reply(422, 'Indique un nom, un prénom et une catégorie valides.');
}

$handle = @fopen($csv, 'c+');
if ($handle === false || !flock($handle, LOCK_EX)) reply(503, 'Enregistrement impossible. Réessaie plus tard.');
$legacyHeader = ['reference', 'date_utc', 'nom', 'prenom', 'categorie', 'exigence_alimentaire', 'allergies', 'autres'];
$header = [...$legacyHeader, 'logement'];
if (fstat($handle)['size'] === 0) {
    if (fputcsv($handle, $header, ';') === false) reply(503, 'Enregistrement impossible.');
} else {
    rewind($handle);
    $existingHeader = fgetcsv($handle, 4096, ';');
    if ($existingHeader === $legacyHeader) {
        rewind($handle);
        $original = stream_get_contents($handle);
        if ($original === false) reply(503, 'Lecture des inscriptions indisponible.');
        rewind($handle);
        fgetcsv($handle, 4096, ';');
        $legacyRows = [];
        while (($existingRow = fgetcsv($handle, 0, ';')) !== false) {
            if (count($existingRow) !== count($legacyHeader)) reply(503, 'Format CSV inattendu.');
            $legacyRows[] = [...$existingRow, 'oui'];
        }
        $buffer = fopen('php://temp', 'w+');
        if ($buffer === false || fputcsv($buffer, $header, ';') === false) reply(503, 'Enregistrement impossible.');
        foreach ($legacyRows as $existingRow) {
            if (fputcsv($buffer, $existingRow, ';') === false) reply(503, 'Enregistrement impossible.');
        }
        rewind($buffer);
        $migrated = stream_get_contents($buffer);
        fclose($buffer);
        if ($migrated === false) reply(503, 'Enregistrement impossible.');
        rewind($handle);
        if (!ftruncate($handle, 0) || fwrite($handle, $migrated) !== strlen($migrated) || !fflush($handle)) {
            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, $original);
            fflush($handle);
            reply(503, 'Enregistrement impossible. Vérifie le fichier des inscriptions.');
        }
    } elseif ($existingHeader !== $header) {
        reply(503, 'Format CSV inattendu.');
    }
}
fseek($handle, 0, SEEK_END);
$reference = strtoupper(bin2hex(random_bytes(5)));
$row = [$reference, gmdate('c'), safeCsv($lastName), safeCsv($firstName), $role, safeCsv($diet), safeCsv($allergies), safeCsv($other), $noLodging === 'oui' ? 'non' : 'oui'];
$written = fputcsv($handle, $row, ';') !== false && fflush($handle) && (!function_exists('fsync') || fsync($handle));
flock($handle, LOCK_UN);
fclose($handle);
if (!$written) reply(503, 'Enregistrement impossible. Réessaie plus tard.');
bearsBackupAfterWrite($private);
$_SESSION['camp_last_submit'] = time();
reply(200, 'Inscription enregistrée. Conserve ta référence : ' . $reference . '.', ['reference' => $reference]);
