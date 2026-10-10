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

const FAMILY_REGISTRATION_HEADER_LEGACY = ['reference', 'date_utc', 'nom', 'email_contact', 'mineur', 'responsable_legal', 'flag', 'match', 'repas', 'joueur_bears', 'femme'];
const FAMILY_REGISTRATION_HEADER_WALLOS = [...FAMILY_REGISTRATION_HEADER_LEGACY, 'benevole_wallos_declare'];
const FAMILY_REGISTRATION_HEADER = [...FAMILY_REGISTRATION_HEADER_WALLOS, 'aide_organisation_declaree'];

function replaceCsvContents($handle, string $contents): bool
{
    rewind($handle);
    if (!ftruncate($handle, 0)) return false;
    $length = strlen($contents);
    $offset = 0;
    while ($offset < $length) {
        $written = fwrite($handle, substr($contents, $offset));
        if ($written === false || $written === 0) return false;
        $offset += $written;
    }
    return fflush($handle) && (!function_exists('fsync') || fsync($handle));
}

function upgradeRegistrationCsv($handle): void
{
    rewind($handle);
    $original = stream_get_contents($handle);
    if ($original === false) respond(503, 'Lecture des inscriptions indisponible.');
    rewind($handle);
    $header = fgetcsv($handle, 4096, ';');
    if ($header !== FAMILY_REGISTRATION_HEADER_LEGACY && $header !== FAMILY_REGISTRATION_HEADER_WALLOS) {
        respond(503, 'Le format de la liste existante doit être mis à jour par un organisateur.');
    }
    $buffer = fopen('php://temp', 'w+');
    if ($buffer === false || fputcsv($buffer, FAMILY_REGISTRATION_HEADER, ';') === false) {
        respond(503, 'Enregistrement impossible.');
    }
    while (($row = fgetcsv($handle, 4096, ';')) !== false) {
        if (count($row) !== count($header)) {
            respond(503, 'Le format de la liste existante doit être mis à jour par un organisateur.');
        }
        if ($header === FAMILY_REGISTRATION_HEADER_LEGACY) $row[] = '';
        $row[] = '';
        if (fputcsv($buffer, $row, ';') === false) respond(503, 'Enregistrement impossible.');
    }
    rewind($buffer);
    $replacement = stream_get_contents($buffer);
    fclose($buffer);
    if ($replacement === false) respond(503, 'Enregistrement impossible.');
    if (!replaceCsvContents($handle, $replacement)) {
        replaceCsvContents($handle, $original);
        respond(503, 'Mise à jour du fichier impossible. Vérifie les inscriptions.');
    }
}

function burgerReservationsOpen(?DateTimeImmutable $now = null): bool
{
    $zone = new DateTimeZone('Europe/Brussels');
    $deadline = new DateTimeImmutable('2026-10-22 00:00:00', $zone);
    return ($now ?? new DateTimeImmutable('now', $zone)) < $deadline;
}

function familyRegistrationCounts(string $path): array
{
    $counts = ['total' => 0, 'women' => 0, 'under18' => 0, 'nonMembers' => 0, 'members' => 0, 'burgers' => 0];
    if (!is_file($path)) {
        return $counts;
    }
    $handle = @fopen($path, 'rb');
    if ($handle === false || !flock($handle, LOCK_SH)) {
        respond(503, 'Compteur temporairement indisponible.');
    }
    $header = fgetcsv($handle, 4096, ';');
    if ($header !== FAMILY_REGISTRATION_HEADER && $header !== FAMILY_REGISTRATION_HEADER_WALLOS && $header !== FAMILY_REGISTRATION_HEADER_LEGACY) {
        respond(503, 'Compteur temporairement indisponible.');
    }
    $legacy = $header === FAMILY_REGISTRATION_HEADER_LEGACY;
    while (($row = fgetcsv($handle, 4096, ';')) !== false) {
        if (count($row) !== count($header) || !in_array($row[6], ['oui', 'non'], true)
            || (!$legacy && !in_array($row[11], ['', 'oui', 'non'], true))
            || ($header === FAMILY_REGISTRATION_HEADER && !in_array($row[12], ['', 'oui', 'non'], true))) {
            respond(503, 'Compteur temporairement indisponible.');
        }
        if ($row[8] === 'oui') {
            $burgers = 1;
        } elseif ($row[8] === 'non') {
            $burgers = 0;
        } elseif (preg_match('/^(?:0|[1-9]|[1-4][0-9]|50)$/', $row[8])) {
            $burgers = (int) $row[8];
        } else {
            respond(503, 'Compteur temporairement indisponible.');
        }
        $counts['burgers'] += $burgers;
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
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        header('Location: export-inscriptions.html', true, 303);
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(405, 'Méthode non autorisée.');
    }
    rateLimit('export', 10);
    $username = $config['export_username'] ?? '';
    $hash = $config['export_password_hash'] ?? '';
    $allowed = is_string($username) && $username !== '' && is_string($hash) && $hash !== ''
        && hash_equals($username, field('export_username', 100))
        && password_verify(field('export_password', 256), $hash);
    if (!$allowed) {
        respond(401, 'Accès réservé aux organisateurs.');
    }
    $path = storagePath($config);
    if (!is_file($path)) {
        respond(404, 'Aucune inscription enregistrée.');
    }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="inscriptions-25-octobre-2026.csv"');
    echo "\xEF\xBB\xBF";
    $handle = @fopen($path, 'rb');
    if ($handle === false || !flock($handle, LOCK_SH)) respond(503, 'Export temporairement indisponible.');
    fpassthru($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    exit;
}

if (isset($_GET['counts'])) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET' || $_GET['counts'] !== '1') {
        respond(405, 'Méthode non autorisée.');
    }
    session_write_close();
    respond(200, 'Inscriptions au tournoi de flag et burgers réservés.', [
        'counts' => familyRegistrationCounts(storagePath($config)),
        'burgerReservationsOpen' => burgerReservationsOpen(),
    ]);
}

if (empty($config['registration_open'])) {
    respond(503, 'Les inscriptions ne sont pas encore ouvertes.');
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['csrf'])) {
    rateLimit('token', 30);
    $_SESSION['family_csrf'] = bin2hex(random_bytes(32));
    $_SESSION['family_started'] = time();
    respond(200, 'Formulaire disponible.', [
        'csrfToken' => $_SESSION['family_csrf'],
        'burgerReservationsOpen' => burgerReservationsOpen(),
    ]);
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
if (strlen($name) < 2 || !preg_match('/\p{L}/u', $name) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, 'Indiquez un nom et une adresse e-mail valides.');
}
$activities = $_POST['activities'] ?? [];
if (!is_array($activities) || !$activities || count(array_filter($activities, 'is_string')) !== count($activities) || array_diff($activities, ['flag', 'meal', 'help']) || count($activities) !== count(array_unique($activities))) {
    respond(422, 'Choisissez au moins une activité.');
}
$playsFlag = in_array('flag', $activities, true);
$reservesBurgers = in_array('meal', $activities, true);
$offersHelp = in_array('help', $activities, true);
if ($offersHelp && ($playsFlag || !$reservesBurgers)) {
    respond(422, 'La proposition d’aide est réservée aux personnes qui prennent des burgers sans jouer au tournoi.');
}
$minorValue = field('minor');
if ($playsFlag && !in_array($minorValue, ['yes', 'no'], true)) {
    respond(422, 'Indiquez si la personne inscrite au tournoi est mineure.');
}
if (!$playsFlag && !in_array($minorValue, ['', 'yes', 'no'], true)) {
    respond(422, 'Réponse sur l’âge invalide.');
}
$minor = $playsFlag && $minorValue === 'yes';
if ($reservesBurgers && !burgerReservationsOpen()) {
    respond(422, 'Les réservations de burgers sont closes depuis le 21 octobre. L’inscription au tournoi de flag reste ouverte.');
}
$burgerQuantityValue = field('burger_quantity', 3);
if ($reservesBurgers && (!preg_match('/^(?:[1-9]|[1-4][0-9]|50)$/', $burgerQuantityValue))) {
    respond(422, 'Indiquez un nombre de burgers entre 1 et 50.');
}
if (!$reservesBurgers && $burgerQuantityValue !== '') {
    respond(422, 'Le nombre de burgers nécessite une réservation de repas.');
}
$burgerQuantity = $reservesBurgers ? (int) $burgerQuantityValue : 0;
$volunteerValue = field('wallos_volunteer', 3);
if (!in_array($volunteerValue, ['', 'yes'], true) || (!$reservesBurgers && $volunteerValue !== '')) {
    respond(422, 'La déclaration de bénévolat concerne uniquement les réservations de burgers.');
}
$volunteer = $reservesBurgers && $volunteerValue === 'yes' ? 'oui' : 'non';
$dayHelp = $offersHelp ? 'oui' : 'non';
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
$guardianConsent = field('guardian_consent');
if ($minor && $guardianConsent !== 'yes') {
    respond(422, 'Pour un mineur, un parent ou tuteur légal doit autoriser les activités choisies.');
}
if (!$minor && $guardianConsent !== '' && !(!$playsFlag && $minorValue === 'yes' && $guardianConsent === 'yes')) {
    respond(422, 'L’autorisation parentale est réservée aux mineurs.');
}

$path = storagePath($config);
$handle = @fopen($path, 'c+');
if ($handle === false || !flock($handle, LOCK_EX)) {
    respond(503, 'Enregistrement impossible. Réessayez plus tard.');
}
if (fstat($handle)['size'] === 0) {
    if (fputcsv($handle, FAMILY_REGISTRATION_HEADER, ';') === false) respond(503, 'Enregistrement impossible.');
} else {
    $header = fgetcsv($handle, 4096, ';');
    if ($header === FAMILY_REGISTRATION_HEADER_LEGACY || $header === FAMILY_REGISTRATION_HEADER_WALLOS) {
        upgradeRegistrationCsv($handle);
    } elseif ($header !== FAMILY_REGISTRATION_HEADER) {
        respond(503, 'Le format de la liste existante doit être mis à jour par un organisateur.');
    }
}
fseek($handle, 0, SEEK_END);
$reference = strtoupper(bin2hex(random_bytes(5)));
$safe = static fn (string $value): string => preg_match('/^[=+\-@\t\r]/', $value) ? "'" . $value : $value;
// Keep the existing CSV column; older rows use oui/non, new rows store the burger count.
$row = [$reference, gmdate('c'), $safe($name), $safe($email), $playsFlag ? ($minor ? 'oui' : 'non') : '', $minor ? 'autorisation déclarée' : '', $playsFlag ? 'oui' : 'non', 'non', (string) $burgerQuantity, $bearsPlayer === '' ? '' : ($bearsPlayer === 'yes' ? 'oui' : 'non'), $woman === '' ? '' : ($woman === 'yes' ? 'oui' : 'non'), $volunteer, $dayHelp];
$written = fputcsv($handle, $row, ';') !== false && fflush($handle) && (!function_exists('fsync') || fsync($handle));
flock($handle, LOCK_UN);
fclose($handle);
if (!$written) {
    respond(503, 'Enregistrement impossible. Réessayez plus tard.');
}
bearsBackupAfterWrite(dirname($path));
$burgers = $burgerQuantity === 1 ? '1 burger' : $burgerQuantity . ' burgers';
$confirmation = $playsFlag
    ? ($reservesBurgers ? 'Inscription au tournoi et réservation de ' . $burgers . ' enregistrées.' : 'Inscription au tournoi enregistrée.')
    : 'Réservation de ' . $burgers . ' enregistrée.';
if ($offersHelp) $confirmation .= ' Ta proposition d’aide à l’organisation est enregistrée.';
respond(200, $confirmation . ' Conservez votre référence : ' . $reference . '.', ['reference' => $reference]);
