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

const CAMP_HEADER = ['reference', 'date_utc', 'nom', 'prenom', 'categorie', 'exigence_alimentaire', 'allergies', 'autres'];

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
    if (fgetcsv($handle, 0, ';') !== CAMP_HEADER) {
        flock($handle, LOCK_UN);
        fclose($handle);
        fail(503, 'Format des inscriptions invalide.');
    }
    return $handle;
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
if ($authenticated) {
    $path = campCsvPath($config);
    if (is_file($path)) {
        $handle = openCampCsv($path);
        while (($row = fgetcsv($handle, 0, ';')) !== false) {
            if (count($row) !== count(CAMP_HEADER) || !isset($totals[$row[4]])) {
                flock($handle, LOCK_UN);
                fclose($handle);
                fail(503, 'Format des inscriptions invalide.');
            }
            $totals[$row[4]]++;
            if (trim($row[5]) !== '') $dietCount++;
            if (trim($row[6]) !== '') $allergyCount++;
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
  <link rel="stylesheet" href="bears.css?v=family-2026-54" />
  <link rel="stylesheet" href="camp-dashboard.css?v=1" />
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
            <thead><tr><th scope="col">Date</th><th scope="col">Participant</th><th scope="col">Catégorie</th><th scope="col">Exigence alimentaire</th><th scope="col">Allergies</th><th scope="col">Autres</th><th scope="col">Référence</th></tr></thead>
            <tbody>
              <?php foreach ($rows as $row): ?>
                <tr>
                  <td data-label="Date"><?= escape(localDate($row[1])) ?></td>
                  <td data-label="Participant"><strong><?= escape($row[3] . ' ' . $row[2]) ?></strong></td>
                  <td data-label="Catégorie"><span class="camp-dashboard-role"><?= escape($row[4]) ?></span></td>
                  <td data-label="Exigence alimentaire"><?= $row[5] !== '' ? escape($row[5]) : '—' ?></td>
                  <td data-label="Allergies"><?= $row[6] !== '' ? escape($row[6]) : '—' ?></td>
                  <td data-label="Autres"><?= $row[7] !== '' ? escape($row[7]) : '—' ?></td>
                  <td data-label="Référence"><code><?= escape($row[0]) ?></code></td>
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
