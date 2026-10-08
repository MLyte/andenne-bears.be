<?php

declare(strict_types=1);

ini_set('session.use_strict_mode', '1');
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if (!$https && !$local) {
    http_response_code(403);
    exit('Connexion HTTPS requise.');
}
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
session_start();

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store, max-age=0');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

const REGISTRATION_HEADER_LEGACY = ['reference', 'date_utc', 'nom', 'email_contact', 'mineur', 'responsable_legal', 'flag', 'match', 'repas', 'joueur_bears', 'femme'];
const REGISTRATION_HEADER_WALLOS = [...REGISTRATION_HEADER_LEGACY, 'benevole_wallos_declare'];
const REGISTRATION_HEADER = [...REGISTRATION_HEADER_WALLOS, 'aide_organisation_declaree'];

function escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function fail(int $code, string $message): never
{
    http_response_code($code);
    exit(escape($message));
}

function privateCsvPath(array $config): string
{
    $dir = $config['storage_dir'] ?? '';
    $private = is_string($dir) ? realpath($dir) : false;
    $webRoot = realpath(__DIR__);
    if ($private === false || $webRoot === false || str_starts_with($private . DIRECTORY_SEPARATOR, $webRoot . DIRECTORY_SEPARATOR)) {
        fail(503, 'Stockage privé indisponible.');
    }
    $path = $private . DIRECTORY_SEPARATOR . 'family-day-2026.csv';
    if (is_link($path)) {
        fail(503, 'Stockage privé indisponible.');
    }
    return $path;
}

function openCsv(string $path)
{
    $handle = @fopen($path, 'rb');
    if ($handle === false || !flock($handle, LOCK_SH)) {
        fail(503, 'Lecture des inscriptions indisponible.');
    }
    $header = fgetcsv($handle, 4096, ';');
    if ($header !== REGISTRATION_HEADER && $header !== REGISTRATION_HEADER_WALLOS && $header !== REGISTRATION_HEADER_LEGACY) {
        fail(503, 'Format des inscriptions invalide.');
    }
    return [$handle, $header];
}

function burgerCount(string $value): int
{
    if ($value === 'oui') return 1;
    if ($value === 'non') return 0;
    if (preg_match('/^(?:0|[1-9]|[1-4][0-9]|50)$/', $value)) return (int) $value;
    fail(503, 'Format des inscriptions invalide.');
}

function rowVersion(array $row): string
{
    return hash('sha256', json_encode(array_slice($row, 0, count(REGISTRATION_HEADER)), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE));
}

function updateRegistration(string $path, string $reference, string $version, array $changes): void
{
    $handle = @fopen($path, 'r+b');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        fail(503, 'Modification temporairement indisponible.');
    }
    $original = stream_get_contents($handle);
    if ($original === false) fail(503, 'Lecture des inscriptions indisponible.');
    rewind($handle);
    $header = fgetcsv($handle, 4096, ';');
    if ($header !== REGISTRATION_HEADER && $header !== REGISTRATION_HEADER_WALLOS && $header !== REGISTRATION_HEADER_LEGACY) fail(503, 'Format des inscriptions invalide.');
    $rows = [];
    $found = false;
    while (($row = fgetcsv($handle, 4096, ';')) !== false) {
        if (count($row) !== count($header) || !in_array($row[6], ['oui', 'non'], true)) {
            fail(503, 'Format des inscriptions invalide.');
        }
        burgerCount($row[8]);
        if ($header === REGISTRATION_HEADER_LEGACY) $row[] = '';
        if ($header !== REGISTRATION_HEADER) $row[] = '';
        if (!in_array($row[11], ['', 'oui', 'non'], true)) fail(503, 'Format des inscriptions invalide.');
        if (!in_array($row[12], ['', 'oui', 'non'], true)) fail(503, 'Format des inscriptions invalide.');
        if ($row[0] === $reference) {
            if ($found) fail(503, 'Référence dupliquée dans les inscriptions.');
            $found = true;
            if (!hash_equals(rowVersion($row), $version)) {
                fail(409, 'Cette inscription a changé entre-temps. Recharge la page avant de la modifier.');
            }
            foreach ($changes as $index => $value) $row[$index] = $value;
        }
        $rows[] = $row;
    }
    if (!$found) fail(404, 'Inscription introuvable. Recharge la page.');
    $buffer = fopen('php://temp', 'w+');
    if ($buffer === false || fputcsv($buffer, REGISTRATION_HEADER, ';') === false) fail(503, 'Modification impossible.');
    foreach ($rows as $row) {
        if (fputcsv($buffer, $row, ';') === false) fail(503, 'Modification impossible.');
    }
    rewind($buffer);
    $replacement = stream_get_contents($buffer);
    fclose($buffer);
    if ($replacement === false) fail(503, 'Modification impossible.');
    rewind($handle);
    $written = ftruncate($handle, 0);
    if ($written) {
        $written = fwrite($handle, $replacement) === strlen($replacement)
            && fflush($handle) && (!function_exists('fsync') || fsync($handle));
    }
    if (!$written) {
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, $original);
        fflush($handle);
        fail(503, 'Modification impossible. Vérifie le fichier des inscriptions.');
    }
    flock($handle, LOCK_UN);
    fclose($handle);
}

function limitLoginAttempts(): void
{
    $file = sys_get_temp_dir() . '/bears-family-dashboard-' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $handle = @fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        fail(503, 'Connexion temporairement indisponible.');
    }
    $entries = json_decode(stream_get_contents($handle) ?: '[]', true);
    $entries = is_array($entries) ? array_values(array_filter($entries, static fn ($time): bool => is_int($time) && $time > time() - 600)) : [];
    if (count($entries) >= 10) {
        fail(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
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
if (!is_array($config) || !is_string($config['export_username'] ?? null) || $config['export_username'] === ''
    || !is_string($config['export_password_hash'] ?? null) || $config['export_password_hash'] === '') {
    fail(503, 'Accès organisateur indisponible.');
}

$_SESSION['family_dashboard_csrf'] ??= bin2hex(random_bytes(32));
$csrf = $_SESSION['family_dashboard_csrf'];
$authenticated = ($_SESSION['family_dashboard_until'] ?? 0) > time();
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submittedCsrf = $_POST['csrf_token'] ?? '';
    if (!is_string($submittedCsrf) || !hash_equals($csrf, $submittedCsrf)) {
        fail(403, 'Session expirée. Recharge la page.');
    }
    $action = $_POST['action'] ?? '';
    if ($action === 'login') {
        limitLoginAttempts();
        $username = $_POST['username'] ?? '';
        $password = $_POST['password'] ?? '';
        if (is_string($username) && is_string($password) && strlen($username) <= 100 && strlen($password) <= 256
            && hash_equals($config['export_username'], $username)
            && password_verify($password, $config['export_password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['family_dashboard_until'] = time() + 8 * 3600;
            $_SESSION['family_dashboard_csrf'] = bin2hex(random_bytes(32));
            header('Location: suivi-inscriptions.php', true, 303);
            exit;
        }
        http_response_code(401);
        $error = 'Identifiant ou mot de passe incorrect.';
    } elseif ($action === 'logout' && $authenticated) {
        unset($_SESSION['family_dashboard_until']);
        session_regenerate_id(true);
        header('Location: suivi-inscriptions.php', true, 303);
        exit;
    } elseif ($action === 'download' && $authenticated) {
        $path = privateCsvPath($config);
        if (!is_file($path)) fail(404, 'Aucune inscription enregistrée.');
        [$handle] = openCsv($path);
        rewind($handle);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="inscriptions-25-octobre-2026.csv"');
        echo "\xEF\xBB\xBF";
        fpassthru($handle);
        flock($handle, LOCK_UN);
        fclose($handle);
        exit;
    } elseif ($action === 'update' && $authenticated) {
        $reference = $_POST['reference'] ?? '';
        $version = $_POST['version'] ?? '';
        $date = $_POST['date'] ?? '';
        $name = $_POST['name'] ?? '';
        $email = $_POST['email'] ?? '';
        $flag = $_POST['flag'] ?? '';
        $burgers = $_POST['burgers'] ?? '';
        $volunteer = $_POST['volunteer'] ?? '';
        $dayHelp = $_POST['day_help'] ?? '';
        $minor = $_POST['minor'] ?? '';
        $guardian = $_POST['guardian'] ?? '';
        $bearsPlayer = $_POST['bears_player'] ?? '';
        $woman = $_POST['woman'] ?? '';
        if (!is_string($reference) || !preg_match('/^[A-F0-9]{10}$/', $reference)
            || !is_string($version) || !preg_match('/^[a-f0-9]{64}$/', $version)
            || !is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $date)
            || !is_string($name) || strlen(trim($name)) < 2 || strlen($name) > 100 || !preg_match('/\p{L}/u', $name)
            || !is_string($email) || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)
            || !is_string($flag) || !in_array($flag, ['oui', 'non'], true)
            || !is_string($burgers) || !preg_match('/^(?:0|[1-9]|[1-4][0-9]|50)$/', $burgers)
            || !is_string($volunteer) || !in_array($volunteer, ['', 'oui', 'non'], true)
            || !is_string($dayHelp) || !in_array($dayHelp, ['', 'oui', 'non'], true)
            || !is_string($minor) || !in_array($minor, ['', 'oui', 'non'], true)
            || !is_string($guardian) || !in_array($guardian, ['', 'oui'], true)
            || !is_string($bearsPlayer) || !in_array($bearsPlayer, ['', 'oui', 'non'], true)
            || !is_string($woman) || !in_array($woman, ['', 'oui', 'non'], true)) {
            fail(422, 'Vérifie la date, le contact et les choix de cette inscription.');
        }
        $localDate = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $date, new DateTimeZone('Europe/Brussels'));
        if ($localDate === false || $localDate->format('Y-m-d\TH:i') !== $date) fail(422, 'Date invalide.');
        if ($flag === 'oui' && ($minor === '' || $bearsPlayer === '' || $woman === '')) {
            fail(422, 'Renseigne mineur, membre Bears et femme pour une inscription au flag.');
        }
        if ($flag === 'non') {
            $minor = $guardian = $bearsPlayer = $woman = '';
        }
        if ($minor === 'oui' && $guardian !== 'oui') {
            fail(422, 'Pour un mineur, confirme l’autorisation du responsable légal.');
        }
        if ($minor !== 'oui') $guardian = '';
        if ($volunteer === 'oui' && (int) $burgers === 0) {
            fail(422, 'La déclaration de bénévolat Wallos nécessite une réservation de burgers.');
        }
        if ($dayHelp === 'oui' && ($flag === 'oui' || (int) $burgers === 0)) {
            fail(422, 'Une proposition d’aide à l’organisation nécessite une réservation de burgers sans participation au flag.');
        }
        $safe = static fn (string $value): string => preg_match('/^[=+\-@\t\r]/', $value) ? "'" . $value : $value;
        updateRegistration(privateCsvPath($config), $reference, $version, [
            1 => $localDate->setTimezone(new DateTimeZone('UTC'))->format('c'),
            2 => $safe(trim($name)), 3 => $safe(trim($email)), 4 => $minor,
            5 => $guardian === 'oui' ? 'autorisation déclarée' : '',
            6 => $flag, 8 => (string) (int) $burgers, 9 => $bearsPlayer,
            10 => $woman, 11 => $volunteer, 12 => $dayHelp,
        ]);
        header('Location: suivi-inscriptions.php?updated=1', true, 303);
        exit;
    } else {
        fail(403, 'Action non autorisée.');
    }
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fail(405, 'Méthode non autorisée.');
}

$rows = [];
$flagTotal = 0;
$burgersTotal = 0;
$potentialFreeTotal = 0;
$dayHelpTotal = 0;
if ($authenticated) {
    $path = privateCsvPath($config);
    if (is_file($path)) {
        [$handle, $header] = openCsv($path);
        while (($row = fgetcsv($handle, 4096, ';')) !== false) {
            if (count($row) !== count($header) || !in_array($row[6], ['oui', 'non'], true)) {
                fail(503, 'Format des inscriptions invalide.');
            }
            if ($header === REGISTRATION_HEADER_LEGACY) $row[] = '';
            if ($header !== REGISTRATION_HEADER) $row[] = '';
            if (!in_array($row[11], ['', 'oui', 'non'], true)) fail(503, 'Format des inscriptions invalide.');
            if (!in_array($row[12], ['', 'oui', 'non'], true)) fail(503, 'Format des inscriptions invalide.');
            $row['burgers'] = burgerCount($row[8]);
            $burgersTotal += $row['burgers'];
            $potentialFreeTotal += $row[11] === 'oui' && $row['burgers'] > 0 ? 1 : 0;
            $dayHelpTotal += $row[12] === 'oui' ? 1 : 0;
            $flagTotal += $row[6] === 'oui' ? 1 : 0;
            $rows[] = $row;
        }
        flock($handle, LOCK_UN);
        fclose($handle);
        $rows = array_reverse($rows);
    }
}

if (($_GET['team_roster'] ?? null) === '1') {
    header('Content-Type: application/json; charset=utf-8');
    if (!$authenticated) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Connexion organisateur requise.']);
        exit;
    }
    $players = [];
    $incomplete = 0;
    foreach ($rows as $row) {
        if ($row[6] !== 'oui') continue;
        if ($row[0] === '' || trim($row[2]) === ''
            || !in_array($row[4], ['oui', 'non'], true)
            || !in_array($row[9], ['oui', 'non'], true)
            || !in_array($row[10], ['oui', 'non'], true)) {
            $incomplete++;
            continue;
        }
        $players[] = [
            'id' => $row[0],
            'name' => $row[2],
            'minor' => $row[4] === 'oui',
            'bears' => $row[9] === 'oui',
            'woman' => $row[10] === 'oui',
            'present' => true,
        ];
    }
    echo json_encode([
        'success' => true,
        'players' => $players,
        'incomplete' => $incomplete,
        'generatedAt' => gmdate('c'),
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function localDate(string $utc): string
{
    try {
        return (new DateTimeImmutable($utc))->setTimezone(new DateTimeZone('Europe/Brussels'))->format('d/m/Y H:i');
    } catch (Exception) {
        return $utc;
    }
}

function editDate(string $utc): string
{
    try {
        return (new DateTimeImmutable($utc))->setTimezone(new DateTimeZone('Europe/Brussels'))->format('Y-m-d\TH:i');
    } catch (Exception) {
        return '';
    }
}

function editSelect(string $name, string $value, array $options, string $form, string $label): string
{
    $html = '<select class="family-dashboard-control" name="' . escape($name) . '" form="' . escape($form) . '" aria-label="' . escape($label) . '">';
    foreach ($options as $option => $text) {
        $html .= '<option value="' . escape((string) $option) . '"' . ($value === (string) $option ? ' selected' : '') . '>' . escape($text) . '</option>';
    }
    return $html . '</select>';
}

function statusMark(string $value, string $yesLabel = 'Oui', string $yesNote = ''): string
{
    if ($value === 'oui') {
        return '<span class="family-dashboard-status-group"><span class="family-dashboard-status family-dashboard-status-yes"><span aria-hidden="true">✓</span><span class="visually-hidden">' . escape($yesLabel) . '</span></span>'
            . ($yesNote !== '' ? '<span class="family-dashboard-status-note" aria-hidden="true">' . escape($yesNote) . '</span>' : '') . '</span>';
    }
    if ($value === 'non') {
        return '<span class="family-dashboard-status family-dashboard-status-no"><span aria-hidden="true">✕</span><span class="visually-hidden">Non</span></span>';
    }
    return '<span class="family-dashboard-status-unknown" title="Non renseigné"><span aria-hidden="true">—</span><span class="visually-hidden">Non renseigné</span></span>';
}
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <title>Suivi des inscriptions | Andenne Bears</title>
  <link rel="icon" href="images/favicon.png" />
  <link rel="stylesheet" href="bears.css?v=family-2026-54" />
</head>
<body class="family-page family-dashboard-page">
  <header class="family-header">
    <a class="brand" href="index.html" aria-label="Andenne Bears, retour à l’accueil"><img src="images/logoBears.png" alt="" /><span>ANDENNE BEARS</span></a>
    <nav class="family-header-actions" aria-label="Navigation"><a href="journee-familiale.html">Retour à la journée</a></nav>
  </header>
  <main class="family-wrap family-dashboard-main">
    <p class="section-kicker">Réservé aux organisateurs</p>
    <h1>Suivi des inscriptions</h1>
    <?php if (!$authenticated): ?>
      <p>Connecte-toi avec les identifiants organisateur pour consulter les inscriptions.</p>
      <?php if ($error !== ''): ?><p class="family-dashboard-error" role="alert"><?= escape($error) ?></p><?php endif; ?>
      <form class="contact-form family-form family-dashboard-login" action="suivi-inscriptions.php" method="post">
        <input type="hidden" name="action" value="login" />
        <input type="hidden" name="csrf_token" value="<?= escape($csrf) ?>" />
        <div class="field"><label for="dashboard-username">Identifiant</label><input id="dashboard-username" name="username" autocomplete="username" required /></div>
        <div class="field"><label for="dashboard-password">Mot de passe</label><input id="dashboard-password" name="password" type="password" autocomplete="current-password" required /></div>
        <button class="button button-primary" type="submit">Voir les inscriptions</button>
      </form>
    <?php else: ?>
      <?php if (($_GET['updated'] ?? '') === '1'): ?><p class="family-dashboard-success" role="status">Inscription mise à jour. Les compteurs tiennent compte de la correction.</p><?php endif; ?>
      <div class="family-dashboard-actions">
        <p>Demandes les plus récentes en premier · actualise la page pour voir les nouvelles inscriptions.</p>
        <div>
          <form action="suivi-inscriptions.php" method="post"><input type="hidden" name="action" value="download" /><input type="hidden" name="csrf_token" value="<?= escape($csrf) ?>" /><button class="button button-primary" type="submit">Télécharger le CSV</button></form>
          <a class="button" href="tirage-equipes.html">Préparer le tirage des équipes</a>
          <form action="suivi-inscriptions.php" method="post"><input type="hidden" name="action" value="logout" /><input type="hidden" name="csrf_token" value="<?= escape($csrf) ?>" /><button class="button" type="submit">Se déconnecter</button></form>
        </div>
      </div>
      <div class="family-dashboard-totals" aria-label="Totaux des inscriptions"><p><strong><?= count($rows) ?></strong> demandes reçues</p><p><strong><?= $flagTotal ?></strong> joueurs de flag</p><p><strong><?= $burgersTotal ?></strong> burgers réservés</p><p><strong><?= $potentialFreeTotal ?></strong> premiers burgers potentiellement offerts</p><p><strong><?= $dayHelpTotal ?></strong> propositions d’aide le 25 octobre</p></div>
      <?php if (!$rows): ?>
        <p>Aucune inscription enregistrée pour le moment.</p>
      <?php else: ?>
        <div class="family-dashboard-table-wrap">
          <table class="family-dashboard-table">
            <caption>Inscriptions du 25 octobre 2026, de la plus récente à la plus ancienne</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Nom</th><th scope="col">Contact</th><th scope="col">Flag</th><th scope="col">Burgers</th><th scope="col">Wallos</th><th scope="col">Bénévole 25 octobre</th><th scope="col">Mineur</th><th scope="col">Joue aux Bears</th><th scope="col">Femme</th><th scope="col">Référence</th><th scope="col">Correction</th></tr></thead>
            <tbody>
              <?php foreach ($rows as $row): $formId = 'correction-' . $row[0]; ?>
                <tr class="family-dashboard-row">
                  <td data-label="Date"><span class="family-dashboard-read"><?= escape(localDate($row[1])) ?></span><span class="family-dashboard-field"><input class="family-dashboard-control" form="<?= escape($formId) ?>" name="date" type="datetime-local" value="<?= escape(editDate($row[1])) ?>" aria-label="Date" required /></span></td>
                  <td data-label="Nom"><span class="family-dashboard-read"><strong><?= escape($row[2]) ?></strong><?php if ($row[6] === 'non' && $row['burgers'] === 0): ?><span class="family-dashboard-cancelled">Annulée</span><?php endif; ?></span><span class="family-dashboard-field"><input class="family-dashboard-control" form="<?= escape($formId) ?>" name="name" value="<?= escape($row[2]) ?>" maxlength="100" aria-label="Nom" required /></span></td>
                  <td data-label="Contact"><span class="family-dashboard-read"><?= escape($row[3]) ?></span><span class="family-dashboard-field"><input class="family-dashboard-control" form="<?= escape($formId) ?>" name="email" type="email" value="<?= escape($row[3]) ?>" maxlength="254" aria-label="Adresse e-mail de contact" required /></span></td>
                  <td data-label="Flag"><span class="family-dashboard-read"><?= statusMark($row[6]) ?></span><span class="family-dashboard-field"><?= editSelect('flag', $row[6], ['oui' => 'Oui', 'non' => 'Non'], $formId, 'Flag') ?></span></td>
                  <td data-label="Burgers"><span class="family-dashboard-read"><?= $row['burgers'] ?></span><span class="family-dashboard-field"><input class="family-dashboard-control" form="<?= escape($formId) ?>" name="burgers" type="number" min="0" max="50" step="1" value="<?= $row['burgers'] ?>" aria-label="Nombre de burgers" required /></span></td>
                  <td data-label="Wallos"><span class="family-dashboard-read"><?= statusMark($row[11], 'Déclaré, à vérifier', 'À vérifier') ?></span><span class="family-dashboard-field"><?= editSelect('volunteer', $row[11], ['' => 'Non renseigné', 'oui' => 'Oui déclaré', 'non' => 'Non'], $formId, 'Bénévole Wallos') ?></span></td>
                  <td data-label="Bénévole 25 octobre"><span class="family-dashboard-read"><?= statusMark($row[12], 'Aide proposée', 'Proposée') ?></span><span class="family-dashboard-field"><?= editSelect('day_help', $row[12], ['' => 'Non renseigné', 'oui' => 'Oui', 'non' => 'Non'], $formId, 'Aide le 25 octobre') ?></span></td>
                  <td data-label="Mineur"><span class="family-dashboard-read"><?= $row[6] === 'oui' ? statusMark($row[4]) : '—' ?></span><span class="family-dashboard-field"><?= editSelect('minor', $row[4], ['' => 'Sans flag', 'oui' => 'Oui', 'non' => 'Non'], $formId, 'Mineur') ?><label class="family-dashboard-consent">Autorisation du responsable légal<?= editSelect('guardian', $row[5] === '' ? '' : 'oui', ['' => 'Non', 'oui' => 'Déclarée'], $formId, 'Autorisation du responsable légal') ?></label></span></td>
                  <td data-label="Joue aux Bears"><span class="family-dashboard-read"><?= statusMark($row[9]) ?></span><span class="family-dashboard-field"><?= editSelect('bears_player', $row[9], ['' => 'Sans flag', 'oui' => 'Oui', 'non' => 'Non'], $formId, 'Joue aux Bears') ?></span></td>
                  <td data-label="Femme"><span class="family-dashboard-read"><?= statusMark($row[10]) ?></span><span class="family-dashboard-field"><?= editSelect('woman', $row[10], ['' => 'Sans flag', 'oui' => 'Oui', 'non' => 'Non'], $formId, 'Femme') ?></span></td>
                  <td data-label="Référence"><?= escape($row[0]) ?></td>
                  <td data-label="Correction"><details class="family-dashboard-edit"><summary>Modifier</summary><form id="<?= escape($formId) ?>" action="suivi-inscriptions.php" method="post"><input type="hidden" name="action" value="update" /><input type="hidden" name="csrf_token" value="<?= escape($csrf) ?>" /><input type="hidden" name="reference" value="<?= escape($row[0]) ?>" /><input type="hidden" name="version" value="<?= rowVersion($row) ?>" /><button class="button button-primary" type="submit">Enregistrer</button></form></details></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      <?php endif; ?>
      <p class="family-dashboard-privacy">Le total des burgers potentiellement offerts compte un premier burger par déclaration bénévole aux Wallos avec réservation, sous réserve de vérification par le club. Les propositions d’aide le 25 octobre sont distinctes et concernent uniquement les personnes qui réservent des burgers sans jouer au flag. « Non renseigné » désigne les demandes reçues avant l’ajout de la question. Une demande sans flag ni burger reste visible comme annulée.</p>
      <p class="family-dashboard-privacy">Cette liste contient des données personnelles. Déconnecte-toi après consultation et ne partage pas son accès.</p>
    <?php endif; ?>
  </main>
</body>
</html>
