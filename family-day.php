<?php

declare(strict_types=1);

ini_set('session.use_strict_mode', '1');
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

function respond(int $code, string $message, array $extra = []): never
{
    http_response_code($code);
    echo json_encode(['success' => $code < 300, 'message' => $message] + $extra, JSON_UNESCAPED_UNICODE);
    exit;
}

function field(string $name, int $max = 150): string
{
    $raw = $_POST[$name] ?? '';
    if (!is_string($raw)) {
        respond(422, 'Un champ est invalide.');
    }
    $value = trim($raw);
    if (strlen($value) > $max || preg_match('/[\x00-\x1F\x7F]/', $value)) {
        respond(422, 'Un champ est trop long ou invalide.');
    }
    return $value;
}

function storagePath(array $config): string
{
    $dir = $config['storage_dir'] ?? '';
    if (!is_string($dir) || $dir === '' || !is_dir($dir)) {
        respond(503, 'Inscriptions temporairement indisponibles.');
    }
    $realDir = realpath($dir);
    $webRoot = realpath(__DIR__);
    if ($realDir === false || $webRoot === false || str_starts_with($realDir . DIRECTORY_SEPARATOR, $webRoot . DIRECTORY_SEPARATOR)) {
        respond(503, 'Stockage privé indisponible.');
    }
    $path = $realDir . DIRECTORY_SEPARATOR . 'family-day-2026.csv';
    if (is_link($path)) {
        respond(503, 'Stockage privé indisponible.');
    }
    return $path;
}

const FAMILY_REGISTRATION_HEADER = ['reference', 'date_utc', 'nom', 'email_contact', 'mineur', 'responsable_legal', 'flag', 'match', 'repas', 'joueur_bears', 'femme'];

function flagRegistrationCounts(string $path): array
{
    $counts = ['total' => 0, 'women' => 0, 'under18' => 0, 'nonMembers' => 0, 'members' => 0];
    if (!is_file($path)) {
        return $counts;
    }
    $handle = @fopen($path, 'rb');
    if ($handle === false || !flock($handle, LOCK_SH)) {
        respond(503, 'Compteur temporairement indisponible.');
    }
    $header = fgetcsv($handle, 4096, ';');
    if ($header !== FAMILY_REGISTRATION_HEADER) {
        respond(503, 'Compteur temporairement indisponible.');
    }
    while (($row = fgetcsv($handle, 4096, ';')) !== false) {
        if (count($row) !== count(FAMILY_REGISTRATION_HEADER) || !in_array($row[6], ['oui', 'non'], true)) {
            respond(503, 'Compteur temporairement indisponible.');
        }
        if ($row[6] !== 'oui') {
            continue;
        }
        if (!in_array($row[4], ['oui', 'non'], true) || !in_array($row[9], ['oui', 'non'], true) || !in_array($row[10], ['oui', 'non'], true)) {
            respond(503, 'Compteur temporairement indisponible.');
        }
        $counts['total']++;
        $counts['women'] += $row[10] === 'oui' ? 1 : 0;
        $counts['under18'] += $row[4] === 'oui' ? 1 : 0;
        $counts['nonMembers'] += $row[9] === 'non' ? 1 : 0;
        $counts['members'] += $row[9] === 'oui' ? 1 : 0;
    }
    flock($handle, LOCK_UN);
    fclose($handle);
    return $counts;
}

function rateLimit(string $scope, int $limit): void
{
    $dir = sys_get_temp_dir() . '/bears-family-rate';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        respond(503, 'Inscriptions temporairement indisponibles.');
    }
    $file = $dir . '/' . hash('sha256', $scope . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $handle = @fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        respond(503, 'Inscriptions temporairement indisponibles.');
    }
    $entries = json_decode(stream_get_contents($handle) ?: '[]', true);
    $entries = is_array($entries) ? array_values(array_filter($entries, static fn ($t): bool => is_int($t) && $t > time() - 600)) : [];
    if (count($entries) >= $limit) {
        flock($handle, LOCK_UN);
        fclose($handle);
        respond(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
    }
    $entries[] = time();
    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, json_encode($entries));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

$configFile = __DIR__ . '/config/family-day-config.php';
$config = is_file($configFile) ? require $configFile : [];
if (!is_array($config)) {
    $config = [];
}

if (isset($_GET['export'])) {
    if (!$https) {
        respond(403, 'Connexion sécurisée requise.');
    }
    rateLimit('export', 10);
    $username = $config['export_username'] ?? '';
    $hash = $config['export_password_hash'] ?? '';
    $allowed = is_string($username) && $username !== '' && is_string($hash) && $hash !== ''
        && hash_equals($username, (string) ($_SERVER['PHP_AUTH_USER'] ?? ''))
        && password_verify((string) ($_SERVER['PHP_AUTH_PW'] ?? ''), $hash);
    if (!$allowed) {
        header('WWW-Authenticate: Basic realm="Andenne Bears inscriptions"');
        respond(401, 'Accès réservé aux organisateurs.');
    }
    $path = storagePath($config);
    if (!is_file($path)) {
        respond(404, 'Aucune inscription enregistrée.');
    }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="inscriptions-25-octobre-2026.csv"');
    echo "\xEF\xBB\xBF";
    readfile($path);
    exit;
}

if (isset($_GET['counts'])) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET' || $_GET['counts'] !== '1') {
        respond(405, 'Méthode non autorisée.');
    }
    session_write_close();
    respond(200, 'Inscriptions au tournoi de flag.', ['counts' => flagRegistrationCounts(storagePath($config))]);
}

if (empty($config['registration_open'])) {
    respond(503, 'Les inscriptions ne sont pas encore ouvertes.');
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['csrf'])) {
    rateLimit('token', 30);
    $_SESSION['family_csrf'] = bin2hex(random_bytes(32));
    $_SESSION['family_started'] = time();
    respond(200, 'Formulaire disponible.', ['csrfToken' => $_SESSION['family_csrf']]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, 'Méthode non autorisée.');
}
rateLimit('submit', 6);
if (strlen((string) ($_SERVER['CONTENT_LENGTH'] ?? '0')) > 10000) {
    respond(413, 'Formulaire trop volumineux.');
}
$token = field('csrf_token', 64);
if (empty($_SESSION['family_csrf']) || !hash_equals($_SESSION['family_csrf'], $token)) {
    respond(403, 'Session expirée. Rechargez la page.');
}
if (time() - (int) ($_SESSION['family_started'] ?? time()) < 3) {
    respond(422, 'Validation anti-spam refusée. Réessayez dans un instant.');
}
unset($_SESSION['family_csrf'], $_SESSION['family_started']);
if (field('company') !== '') {
    respond(200, 'Inscription reçue.');
}

$name = field('name', 100);
$email = field('email', 254);
$minorValue = field('minor');
if (!in_array($minorValue, ['yes', 'no'], true)) {
    respond(422, 'Indiquez si la personne inscrite est mineure.');
}
$minor = $minorValue === 'yes';
if (strlen($name) < 2 || !preg_match('/\p{L}/u', $name) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, 'Indiquez un nom et une adresse e-mail valides.');
}
$activities = $_POST['activities'] ?? [];
if (!is_array($activities) || !$activities || count(array_filter($activities, 'is_string')) !== count($activities) || array_diff($activities, ['flag', 'meal']) || count($activities) !== count(array_unique($activities))) {
    respond(422, 'Choisissez au moins une activité.');
}
$playsFlag = in_array('flag', $activities, true);
$bearsPlayer = field('bears_player', 3);
$woman = field('woman', 3);
if ($playsFlag) {
    if (!in_array($bearsPlayer, ['yes', 'no'], true)) {
        respond(422, 'Indiquez si la personne joue déjà aux Andenne Bears.');
    }
    if (!in_array($woman, ['yes', 'no'], true)) {
        respond(422, 'Indiquez si la personne inscrite est une femme.');
    }
} elseif ($bearsPlayer !== '' || $woman !== '') {
    respond(422, 'Les questions de composition concernent uniquement le flag.');
}
if ($minor && field('guardian_consent') !== 'yes') {
    respond(422, 'Pour un mineur, un parent ou tuteur légal doit autoriser les activités choisies.');
}
if (!$minor && field('guardian_consent') !== '') {
    respond(422, 'L’autorisation parentale est réservée aux mineurs.');
}

$path = storagePath($config);
$handle = @fopen($path, 'c+');
if ($handle === false || !flock($handle, LOCK_EX)) {
    respond(503, 'Enregistrement impossible. Réessayez plus tard.');
}
if (fstat($handle)['size'] > 0 && fgetcsv($handle, 4096, ';') !== FAMILY_REGISTRATION_HEADER) {
    flock($handle, LOCK_UN);
    fclose($handle);
    respond(503, 'Le format de la liste existante doit être mis à jour par un organisateur.');
}
if (fstat($handle)['size'] === 0 && fputcsv($handle, FAMILY_REGISTRATION_HEADER, ';') === false) {
    flock($handle, LOCK_UN);
    fclose($handle);
    respond(503, 'Enregistrement impossible.');
}
fseek($handle, 0, SEEK_END);
$reference = strtoupper(bin2hex(random_bytes(5)));
$safe = static fn (string $value): string => preg_match('/^[=+\-@\t\r]/', $value) ? "'" . $value : $value;
// Keep the existing CSV column so previously created registration files remain readable.
$row = [$reference, gmdate('c'), $safe($name), $safe($email), $minor ? 'oui' : 'non', $minor ? 'autorisation déclarée' : '', $playsFlag ? 'oui' : 'non', 'non', in_array('meal', $activities, true) ? 'oui' : 'non', $bearsPlayer === '' ? '' : ($bearsPlayer === 'yes' ? 'oui' : 'non'), $woman === '' ? '' : ($woman === 'yes' ? 'oui' : 'non')];
$written = fputcsv($handle, $row, ';') !== false && fflush($handle) && (!function_exists('fsync') || fsync($handle));
flock($handle, LOCK_UN);
fclose($handle);
if (!$written) {
    respond(503, 'Enregistrement impossible. Réessayez plus tard.');
}
$confirmation = $playsFlag
    ? (in_array('meal', $activities, true) ? 'Inscription au tournoi et réservation du repas enregistrées.' : 'Inscription au tournoi enregistrée.')
    : 'Réservation du repas enregistrée.';
respond(200, $confirmation . ' Conservez votre référence : ' . $reference . '.', ['reference' => $reference]);
