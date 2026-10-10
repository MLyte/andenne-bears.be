<?php

declare(strict_types=1);

require_once __DIR__ . '/private-backup.php';

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

const CAMP_HEADER_LEGACY = ['reference', 'date_utc', 'nom', 'prenom', 'categorie', 'exigence_alimentaire', 'allergies', 'autres'];
const CAMP_HEADER = ['reference', 'date_utc', 'nom', 'prenom', 'categorie', 'exigence_alimentaire', 'allergies', 'autres', 'logement'];

function campRow(array $row): array
{
    if (count($row) === count(CAMP_HEADER_LEGACY)) $row[] = 'oui';
    return $row;
}

function escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function fail(int $code, string $message): never
{
    http_response_code($code);
    exit(escape($message));
}

function campCsvPath(array $config): string
{
    $dir = $config['storage_dir'] ?? '';
    $private = is_string($dir) ? realpath($dir) : false;
    $webRoot = realpath(__DIR__);
    if ($private === false || $webRoot === false
        || str_starts_with($private . DIRECTORY_SEPARATOR, $webRoot . DIRECTORY_SEPARATOR)) {
        fail(503, 'Stockage privé indisponible.');
    }
    $path = $private . DIRECTORY_SEPARATOR . 'camp-blegny-2026.csv';
    if (is_link($path)) fail(503, 'Stockage privé indisponible.');
    return $path;
}

function openCampCsv(string $path)
{
    $handle = @fopen($path, 'rb');
    if ($handle === false || !flock($handle, LOCK_SH)) fail(503, 'Lecture des inscriptions indisponible.');
    if (!in_array(fgetcsv($handle, 0, ';'), [CAMP_HEADER, CAMP_HEADER_LEGACY], true)) {
        flock($handle, LOCK_UN);
        fclose($handle);
        fail(503, 'Format des inscriptions invalide.');
    }
    return $handle;
}

function campRowVersion(array $row): string
{
    return hash('sha256', json_encode($row, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE));
}

function saveCampRegistration(string $path, string $reference, string $version, array $changes): void
{
    $handle = @fopen($path, 'r+b');
    if ($handle === false || !flock($handle, LOCK_EX)) fail(503, 'Modification temporairement indisponible.');
    $original = stream_get_contents($handle);
    if ($original === false) fail(503, 'Lecture des inscriptions indisponible.');
    rewind($handle);
    if (!in_array(fgetcsv($handle, 0, ';'), [CAMP_HEADER, CAMP_HEADER_LEGACY], true)) fail(503, 'Format des inscriptions invalide.');
    $rows = [];
    $found = false;
    while (($row = fgetcsv($handle, 0, ';')) !== false) {
        $row = campRow($row);
        if (count($row) !== count(CAMP_HEADER) || !in_array($row[4], ['Junior', 'Senior', 'Staff'], true) || !in_array($row[8], ['oui', 'non'], true)) {
            fail(503, 'Format des inscriptions invalide.');
        }
        if ($row[0] === $reference) {
            if ($found) fail(503, 'Référence dupliquée dans les inscriptions.');
            $found = true;
            if (!hash_equals(campRowVersion($row), $version)) {
                fail(409, 'Cette inscription a changé entre-temps. Recharge la page avant de la modifier.');
            }
            foreach ($changes as $index => $value) $row[$index] = $value;
        }
        $rows[] = $row;
    }
    if (!$found) fail(404, 'Inscription introuvable. Recharge la page.');
    $buffer = fopen('php://temp', 'w+');
    if ($buffer === false || fputcsv($buffer, CAMP_HEADER, ';') === false) fail(503, 'Modification impossible.');
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

function campResponseFilled(string $value): bool
{
    return trim($value) !== '' && trim($value) !== '/';
}

function editCampDate(string $utc): string
{
    try {
        return (new DateTimeImmutable($utc))->setTimezone(new DateTimeZone('Europe/Brussels'))->format('Y-m-d\TH:i');
    } catch (Exception) {
        return '';
    }
}

function limitCampLoginAttempts(): void
{
    // Share the existing organizer login limit across both dashboards.
    $file = sys_get_temp_dir() . '/bears-family-dashboard-' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $handle = @fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) fail(503, 'Connexion temporairement indisponible.');
    $entries = json_decode(stream_get_contents($handle) ?: '[]', true);
    $entries = is_array($entries) ? array_values(array_filter($entries, static fn ($time): bool => is_int($time) && $time > time() - 600)) : [];
    if (count($entries) >= 10) fail(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
    $entries[] = time();
    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, json_encode($entries));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function localDate(string $utc): string
{
    try {
        return (new DateTimeImmutable($utc))->setTimezone(new DateTimeZone('Europe/Brussels'))->format('d/m/Y H:i');
    } catch (Exception) {
        return $utc;
    }
}

$configFile = __DIR__ . '/config/family-day-config.php';
$config = is_file($configFile) ? require $configFile : [];
if (!is_array($config) || !is_string($config['export_username'] ?? null)
    || $config['export_username'] === '' || !is_string($config['export_password_hash'] ?? null)
    || $config['export_password_hash'] === '') fail(503, 'Accès organisateur indisponible.');

$_SESSION['camp_dashboard_csrf'] ??= bin2hex(random_bytes(32));
$csrf = $_SESSION['camp_dashboard_csrf'];
$authenticated = ($_SESSION['camp_dashboard_until'] ?? 0) > time();
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submittedCsrf = $_POST['csrf_token'] ?? '';
    if (!is_string($submittedCsrf) || !hash_equals($csrf, $submittedCsrf)) {
        fail(403, 'Session expirée. Recharge la page.');
    }
    $action = $_POST['action'] ?? '';
    if ($action === 'login') {
        limitCampLoginAttempts();
        $username = $_POST['username'] ?? '';
        $password = $_POST['password'] ?? '';
        if (is_string($username) && is_string($password) && strlen($username) <= 100 && strlen($password) <= 256
            && hash_equals($config['export_username'], $username)
            && password_verify($password, $config['export_password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['camp_dashboard_until'] = time() + 8 * 3600;
            $_SESSION['camp_dashboard_csrf'] = bin2hex(random_bytes(32));
            header('Location: suivi-camp-blegny.php', true, 303);
            exit;
        }
        http_response_code(401);
        $error = 'Identifiant ou mot de passe incorrect.';
    } elseif ($action === 'logout' && $authenticated) {
        unset($_SESSION['camp_dashboard_until']);
        session_regenerate_id(true);
        header('Location: suivi-camp-blegny.php', true, 303);
        exit;
    } elseif ($action === 'download' && $authenticated) {
        $path = campCsvPath($config);
        if (!is_file($path)) fail(404, 'Aucune inscription enregistrée.');
        $handle = openCampCsv($path);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="inscriptions-camp-blegny-2026.csv"');
        echo "\xEF\xBB\xBF";
        rewind($handle);
        fpassthru($handle);
        flock($handle, LOCK_UN);
        fclose($handle);
        exit;
    } elseif ($action === 'update' && $authenticated) {
        $reference = $_POST['reference'] ?? '';
        $version = $_POST['version'] ?? '';
        $date = $_POST['date'] ?? '';
        $lastName = $_POST['last_name'] ?? '';
        $firstName = $_POST['first_name'] ?? '';
        $role = $_POST['role'] ?? '';
        $lodging = $_POST['lodging'] ?? '';
        $diet = $_POST['diet'] ?? '';
        $allergies = $_POST['allergies'] ?? '';
        $other = $_POST['other'] ?? '';
        if (!is_string($reference) || !preg_match('/^[A-F0-9]{10}$/', $reference)
            || !is_string($version) || !preg_match('/^[a-f0-9]{64}$/', $version)
            || !is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $date)
            || !is_string($lastName) || strlen(trim($lastName)) < 2 || strlen($lastName) > 100 || !preg_match('/\p{L}/u', $lastName)
            || !is_string($firstName) || strlen(trim($firstName)) < 2 || strlen($firstName) > 100 || !preg_match('/\p{L}/u', $firstName)
            || !is_string($role) || !in_array($role, ['Junior', 'Senior', 'Staff'], true)
            || !is_string($lodging) || !in_array($lodging, ['oui', 'non'], true)
            || !is_string($diet) || strlen($diet) > 1000
            || !is_string($allergies) || strlen($allergies) > 1000
            || !is_string($other) || strlen($other) > 1000) {
            fail(422, 'Vérifie la date, le participant et les réponses de cette inscription.');
        }
        $localDate = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $date, new DateTimeZone('Europe/Brussels'));
        if ($localDate === false || $localDate->format('Y-m-d\TH:i') !== $date) fail(422, 'Date invalide.');
        $safe = static fn (string $value): string => preg_match('/^[=+\-@\t\r]/', $value) ? "'" . $value : $value;
        saveCampRegistration(campCsvPath($config), $reference, $version, [
            1 => $localDate->setTimezone(new DateTimeZone('UTC'))->format('c'),
            2 => $safe(trim($lastName)), 3 => $safe(trim($firstName)), 4 => $role,
            5 => $safe(trim($diet)), 6 => $safe(trim($allergies)), 7 => $safe(trim($other)), 8 => $lodging,
        ]);
        bearsBackupAfterWrite(dirname(campCsvPath($config)));
        header('Location: suivi-camp-blegny.php?updated=1', true, 303);
        exit;
    } else {
        fail(403, 'Action non autorisée.');
    }
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fail(405, 'Méthode non autorisée.');
}

$rows = [];
$totals = ['Junior' => 0, 'Senior' => 0, 'Staff' => 0];
$dietCount = 0;
$allergyCount = 0;
$lodgingCount = 0;
if ($authenticated) {
    $path = campCsvPath($config);
    if (is_file($path)) {
        $handle = openCampCsv($path);
        while (($row = fgetcsv($handle, 0, ';')) !== false) {
            $row = campRow($row);
            if (count($row) !== count(CAMP_HEADER) || !isset($totals[$row[4]]) || !in_array($row[8], ['oui', 'non'], true)) {
                flock($handle, LOCK_UN);
                fclose($handle);
                fail(503, 'Format des inscriptions invalide.');
            }
            $totals[$row[4]]++;
            if ($row[8] === 'oui') $lodgingCount++;
            if (campResponseFilled($row[5])) $dietCount++;
            if (campResponseFilled($row[6])) $allergyCount++;
            $rows[] = $row;
        }
        flock($handle, LOCK_UN);
        fclose($handle);
        $rows = array_reverse($rows);
    }
}
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow, noarchive" />
  <title>Suivi du camp de Blégny | Andenne Bears</title>
  <link rel="icon" href="images/favicon.png" />
  <link rel="stylesheet" href="bears.css?v=cursor-2026-10-10" />
  <link rel="stylesheet" href="camp-dashboard.css?v=2" />
</head>
<body class="family-page family-dashboard-page camp-dashboard-page">
  <header class="family-header">
    <a class="brand" href="index.html" aria-label="Andenne Bears, retour à l’accueil"><img src="images/logoBears.png" alt="" /><span>ANDENNE BEARS</span></a>
    <nav class="family-header-actions" aria-label="Navigation"><a href="camp-blegny.html">Voir la page du camp</a></nav>
  </header>
  <main class="family-wrap family-dashboard-main">
    <p class="section-kicker">Réservé aux organisateurs</p>
    <h1>Suivi du camp de Blégny</h1>
    <?php if (!$authenticated): ?>
      <p>Connecte-toi pour consulter les inscriptions et les besoins signalés par les participants.</p>
      <?php if ($error !== ''): ?><p class="family-dashboard-error" role="alert"><?= escape($error) ?></p><?php endif; ?>
      <form class="contact-form family-form family-dashboard-login" action="suivi-camp-blegny.php" method="post">
        <input type="hidden" name="action" value="login" />
        <input type="hidden" name="csrf_token" value="<?= escape($csrf) ?>" />
        <div class="field"><label for="camp-dashboard-username">Identifiant</label><input id="camp-dashboard-username" name="username" autocomplete="username" required /></div>
        <div class="field"><label for="camp-dashboard-password">Mot de passe</label><input id="camp-dashboard-password" name="password" type="password" autocomplete="current-password" required /></div>
        <button class="button button-primary" type="submit">Voir les inscriptions</button>
      </form>
    <?php else: ?>
      <?php if (($_GET['updated'] ?? '') === '1'): ?><p class="family-dashboard-success" role="status">Inscription mise à jour. Les compteurs et l’export CSV tiennent compte de la correction.</p><?php endif; ?>
      <div class="family-dashboard-actions">
        <p>Inscriptions les plus récentes en premier. Actualise la page pour voir les nouvelles réponses.</p>
        <div>
          <?php if ($rows): ?><form action="suivi-camp-blegny.php" method="post"><input type="hidden" name="action" value="download" /><input type="hidden" name="csrf_token" value="<?= escape($csrf) ?>" /><button class="button button-primary" type="submit">Télécharger le CSV</button></form><?php endif; ?>
          <form action="suivi-camp-blegny.php" method="post"><input type="hidden" name="action" value="logout" /><input type="hidden" name="csrf_token" value="<?= escape($csrf) ?>" /><button class="button" type="submit">Se déconnecter</button></form>
        </div>
      </div>
      <div class="family-dashboard-totals" aria-label="Totaux des inscriptions">
        <p><strong><?= count($rows) ?></strong> inscriptions</p>
        <p><strong><?= $totals['Junior'] ?></strong> Juniors</p>
        <p><strong><?= $totals['Senior'] ?></strong> Seniors</p>
        <p><strong><?= $totals['Staff'] ?></strong> Staff</p>
        <p><strong><?= count($rows) ?></strong> personnes aux repas</p>
        <p><strong><?= $lodgingCount ?></strong> lits à prévoir</p>
        <p><strong><?= count($rows) - $lodgingCount ?></strong> sans logement</p>
      </div>
      <p class="camp-dashboard-needs"><strong><?= $dietCount ?></strong> exigences alimentaires renseignées · <strong><?= $allergyCount ?></strong> allergies renseignées. Ces réponses sont des déclarations à prendre en compte dans l’organisation.</p>
      <?php if (!$rows): ?>
        <p class="camp-dashboard-empty">Aucune inscription enregistrée pour le moment.</p>
      <?php else: ?>
        <h2 class="camp-dashboard-list-title">Liste des inscrits</h2>
        <p class="camp-dashboard-list-note">Du plus récent au plus ancien · camp du 11 au 13 décembre 2026</p>
        <div class="camp-dashboard-table-wrap">
          <table class="camp-dashboard-table">
            <caption>Inscriptions au camp du 11 au 13 décembre 2026, de la plus récente à la plus ancienne</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Participant</th><th scope="col">Catégorie</th><th scope="col">Logement</th><th scope="col">Exigence alimentaire</th><th scope="col">Allergies</th><th scope="col">Autres</th><th scope="col">Référence</th><th scope="col">Correction</th></tr></thead>
            <tbody>
              <?php foreach ($rows as $row): $formId = 'camp-correction-' . $row[0]; ?>
                <tr class="family-dashboard-row">
                  <td data-label="Date"><span class="family-dashboard-read"><?= escape(localDate($row[1])) ?></span><span class="family-dashboard-field"><input class="family-dashboard-control" form="<?= escape($formId) ?>" name="date" type="datetime-local" value="<?= escape(editCampDate($row[1])) ?>" aria-label="Date" required /></span></td>
                  <td data-label="Participant"><span class="family-dashboard-read"><strong><?= escape($row[3] . ' ' . $row[2]) ?></strong></span><span class="family-dashboard-field camp-dashboard-name-fields"><input class="family-dashboard-control" form="<?= escape($formId) ?>" name="first_name" value="<?= escape($row[3]) ?>" maxlength="100" aria-label="Prénom" required /><input class="family-dashboard-control" form="<?= escape($formId) ?>" name="last_name" value="<?= escape($row[2]) ?>" maxlength="100" aria-label="Nom" required /></span></td>
                  <td data-label="Catégorie"><span class="family-dashboard-read camp-dashboard-role"><?= escape($row[4]) ?></span><span class="family-dashboard-field"><select class="family-dashboard-control" form="<?= escape($formId) ?>" name="role" aria-label="Catégorie"><?php foreach (['Junior', 'Senior', 'Staff'] as $role): ?><option value="<?= escape($role) ?>"<?= $row[4] === $role ? ' selected' : '' ?>><?= escape($role) ?></option><?php endforeach; ?></select></span></td>
                  <td data-label="Logement"><span class="family-dashboard-read"><?= $row[8] === 'oui' ? 'Sur place' : 'Sans logement · repas compris' ?></span><span class="family-dashboard-field"><select class="family-dashboard-control" form="<?= escape($formId) ?>" name="lodging" aria-label="Logement"><option value="oui"<?= $row[8] === 'oui' ? ' selected' : '' ?>>Sur place</option><option value="non"<?= $row[8] === 'non' ? ' selected' : '' ?>>Sans logement, repas compris</option></select></span></td>
                  <td data-label="Exigence alimentaire"><span class="family-dashboard-read"><?= campResponseFilled($row[5]) ? escape($row[5]) : '—' ?></span><span class="family-dashboard-field"><textarea class="family-dashboard-control" form="<?= escape($formId) ?>" name="diet" maxlength="1000" rows="3" aria-label="Exigence alimentaire"><?= escape($row[5]) ?></textarea></span></td>
                  <td data-label="Allergies"><span class="family-dashboard-read"><?= campResponseFilled($row[6]) ? escape($row[6]) : '—' ?></span><span class="family-dashboard-field"><textarea class="family-dashboard-control" form="<?= escape($formId) ?>" name="allergies" maxlength="1000" rows="3" aria-label="Allergies"><?= escape($row[6]) ?></textarea></span></td>
                  <td data-label="Autres"><span class="family-dashboard-read"><?= $row[7] !== '' ? escape($row[7]) : '—' ?></span><span class="family-dashboard-field"><textarea class="family-dashboard-control" form="<?= escape($formId) ?>" name="other" maxlength="1000" rows="3" aria-label="Autres informations"><?= escape($row[7]) ?></textarea></span></td>
                  <td data-label="Référence"><code><?= escape($row[0]) ?></code></td>
                  <td data-label="Correction"><details class="family-dashboard-edit"><summary>Modifier</summary><form id="<?= escape($formId) ?>" action="suivi-camp-blegny.php" method="post"><input type="hidden" name="action" value="update" /><input type="hidden" name="csrf_token" value="<?= escape($csrf) ?>" /><input type="hidden" name="reference" value="<?= escape($row[0]) ?>" /><input type="hidden" name="version" value="<?= campRowVersion($row) ?>" /><button class="button button-primary" type="submit">Enregistrer</button></form></details></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      <?php endif; ?>
      <p class="family-dashboard-privacy">Cette liste contient des données personnelles et des informations sur les allergies. Déconnecte-toi après consultation et ne partage ni l’accès ni l’export publiquement.</p>
    <?php endif; ?>
  </main>
</body>
</html>
