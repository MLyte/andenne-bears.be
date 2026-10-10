<?php

declare(strict_types=1);

require_once __DIR__ . '/private-backup.php';

ini_set('session.use_strict_mode', '1');
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if (!$https && !$local) {
    http_response_code(403);
    exit;
}
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

function drawFail(int $code, string $message): never
{
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

$configFile = __DIR__ . '/config/family-day-config.php';
$config = is_file($configFile) ? require $configFile : [];
if (!is_array($config) || !is_string($config['storage_dir'] ?? null)) drawFail(503, 'Stockage privé indisponible.');
$private = realpath($config['storage_dir']);
$webRoot = realpath(__DIR__);
if ($private === false || $webRoot === false || str_starts_with($private . DIRECTORY_SEPARATOR, $webRoot . DIRECTORY_SEPARATOR)) {
    drawFail(503, 'Stockage privé indisponible.');
}
if (($_SESSION['family_dashboard_until'] ?? 0) <= time()) drawFail(401, 'Connexion organisateur requise.');
$_SESSION['family_dashboard_csrf'] ??= bin2hex(random_bytes(32));
$path = $private . DIRECTORY_SEPARATOR . 'family-teams-2026.csv';
$lockPath = $private . DIRECTORY_SEPARATOR . 'family-teams-2026.lock';
if (is_link($path) || is_link($lockPath)) drawFail(503, 'Stockage privé indisponible.');
$lock = @fopen($lockPath, 'c+');
if ($lock === false || !flock($lock, LOCK_EX)) drawFail(503, 'Stockage privé temporairement indisponible.');
$current = is_file($path) ? @file_get_contents($path) : null;
if ($current === false) drawFail(503, 'Lecture du tirage impossible.');
$version = $current === null ? '' : hash('sha256', $current);
$header = ['type', 'equipe', 'ordre', 'reference', 'nom', 'bears', 'femme', 'mineur', 'present', 'proche_reference', 'tirage', 'nombre_equipes', 'revision'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $state = null;
    if ($current !== null) {
        $stream = fopen('php://temp', 'w+');
        fwrite($stream, $current);
        rewind($stream);
        if (fgetcsv($stream, 4096, ';') !== $header) drawFail(503, 'Format du tirage invalide.');
        $roster = [];
        $teams = [];
        $waiting = [];
        $links = [];
        $seed = null;
        $teamCount = null;
        $revision = null;
        while (($row = fgetcsv($stream, 4096, ';')) !== false) {
            if (count($row) !== count($header)) drawFail(503, 'Format du tirage invalide.');
            [$kind, $team, $order, $id, $name, $bears, $woman, $minor, $present, $relative, $rowSeed, $rowCount, $rowRevision] = $row;
            if ($kind !== 'joueur' || !in_array($bears, ['oui', 'non'], true) || !in_array($woman, ['oui', 'non'], true)
                || !in_array($minor, ['oui', 'non'], true) || !in_array($present, ['oui', 'non'], true)
                || !ctype_digit($order) || !ctype_digit($rowSeed) || !ctype_digit($rowCount) || !ctype_digit($rowRevision)) {
                drawFail(503, 'Format du tirage invalide.');
            }
            $seed ??= (int) $rowSeed;
            $teamCount ??= (int) $rowCount;
            $revision ??= (int) $rowRevision;
            if ($seed !== (int) $rowSeed || $teamCount !== (int) $rowCount || $revision !== (int) $rowRevision) drawFail(503, 'Format du tirage invalide.');
            $roster[] = ['id' => $id, 'name' => $name, 'bears' => $bears === 'oui', 'woman' => $woman === 'oui', 'minor' => $minor === 'oui', 'present' => $present === 'oui'];
            if ($relative !== '') $links[] = ['childId' => $id, 'relativeId' => $relative];
            if ($team === 'attente') $waiting[(int) $order] = $id;
            elseif ($team !== '' && ctype_digit($team) && (int) $team >= 1 && (int) $team <= 200) $teams[(int) $team][(int) $order] = $id;
            elseif ($team !== '') drawFail(503, 'Format du tirage invalide.');
        }
        fclose($stream);
        if (!$roster || $seed === null) drawFail(503, 'Format du tirage invalide.');
        ksort($teams);
        ksort($waiting);
        $state = ['roster' => $roster, 'teams' => array_map(static function ($team) { ksort($team); return array_values($team); }, array_values($teams)),
            'waiting' => array_values($waiting), 'links' => $links, 'seed' => $seed, 'teamCount' => $teamCount, 'revision' => $revision];
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    echo json_encode(['success' => true, 'csrf' => $_SESSION['family_dashboard_csrf'] ?? '', 'version' => $version, 'state' => $state], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') drawFail(405, 'Méthode non autorisée.');
if (($_SERVER['CONTENT_LENGTH'] ?? 0) > 150000) drawFail(413, 'Tirage trop volumineux.');
$payload = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($payload) || !is_string($payload['csrf'] ?? null)
    || !hash_equals((string) ($_SESSION['family_dashboard_csrf'] ?? ''), $payload['csrf'])) drawFail(403, 'Session expirée. Recharge la page.');
if (!is_string($payload['version'] ?? null) || !hash_equals($version, $payload['version'])) {
    drawFail(409, 'Un autre tirage a été sauvé entre-temps. Recharge la page avant de sauver.');
}
$state = $payload['state'] ?? null;
if (!is_array($state) || !is_array($state['roster'] ?? null) || !is_array($state['teams'] ?? null)
    || !is_array($state['waiting'] ?? null) || !is_array($state['links'] ?? null)
    || !is_int($state['seed'] ?? null) || $state['seed'] < 0 || $state['seed'] > 4294967295
    || !is_int($state['teamCount'] ?? null) || $state['teamCount'] < 1 || $state['teamCount'] > 200
    || !is_int($state['revision'] ?? null) || $state['revision'] < 0
    || count($state['roster']) < 1 || count($state['roster']) > 200 || count($state['teams']) > $state['teamCount']) {
    drawFail(422, 'Tirage invalide.');
}
$people = [];
foreach ($state['roster'] as $player) {
    if (!is_array($player) || !is_string($player['id'] ?? null) || !preg_match('/^(?:[A-F0-9]{10}|sur-place-[1-9][0-9]*)$/', $player['id'])
        || isset($people[$player['id']]) || !is_string($player['name'] ?? null) || strlen($player['name']) < 2 || strlen($player['name']) > 100
        || !preg_match('/\p{L}/u', $player['name']) || preg_match('/^[=+\-@\t\r]/', $player['name'])
        || !is_bool($player['bears'] ?? null) || !is_bool($player['woman'] ?? null)
        || !is_bool($player['minor'] ?? null) || !is_bool($player['present'] ?? null)) drawFail(422, 'Profil invalide.');
    $people[$player['id']] = $player;
}
$locations = [];
foreach ($state['teams'] as $index => $team) {
    if (!is_array($team) || count($team) < 1 || count($team) > 5) drawFail(422, 'Composition d’équipe invalide.');
    foreach ($team as $order => $id) {
        if (!is_string($id) || !isset($people[$id]) || !$people[$id]['present'] || isset($locations[$id])) drawFail(422, 'Joueur placé en double ou absent.');
        $locations[$id] = [(string) ($index + 1), (string) $order];
    }
}
foreach ($state['waiting'] as $order => $id) {
    if (!is_string($id) || !isset($people[$id]) || !$people[$id]['present'] || isset($locations[$id])) drawFail(422, 'Liste d’attente invalide.');
    $locations[$id] = ['attente', (string) $order];
}
foreach ($people as $id => $player) {
    if ($player['present'] !== isset($locations[$id])) drawFail(422, 'Tous les joueurs présents doivent être placés ou en attente.');
}
$relatives = [];
foreach ($state['links'] as $link) {
    if (!is_array($link) || !is_string($link['childId'] ?? null) || !is_string($link['relativeId'] ?? null)
        || !isset($people[$link['childId']], $people[$link['relativeId']]) || !$people[$link['childId']]['minor']
        || isset($relatives[$link['childId']]) || $link['childId'] === $link['relativeId']) drawFail(422, 'Lien familial invalide.');
    $relatives[$link['childId']] = $link['relativeId'];
    if (isset($locations[$link['childId']], $locations[$link['relativeId']])
        && $locations[$link['childId']][0] !== $locations[$link['relativeId']][0]) {
        drawFail(422, 'Le lien familial doit rester dans la même équipe ou en attente.');
    }
}
$buffer = fopen('php://temp', 'w+');
fputcsv($buffer, $header, ';');
foreach ($state['roster'] as $player) {
    $id = $player['id'];
    [$team, $order] = $locations[$id] ?? ['', '0'];
    fputcsv($buffer, ['joueur', $team, $order, $id, $player['name'], $player['bears'] ? 'oui' : 'non',
        $player['woman'] ? 'oui' : 'non', $player['minor'] ? 'oui' : 'non', $player['present'] ? 'oui' : 'non',
        $relatives[$id] ?? '', (string) $state['seed'], (string) $state['teamCount'], (string) $state['revision']], ';');
}
rewind($buffer);
$csv = stream_get_contents($buffer);
fclose($buffer);
if ($csv === false) drawFail(503, 'Enregistrement impossible.');
$temporary = @tempnam($private, 'family-teams-');
if ($temporary === false || @file_put_contents($temporary, $csv, LOCK_EX) !== strlen($csv)) drawFail(503, 'Enregistrement impossible.');
@chmod($temporary, 0600);
if (!@rename($temporary, $path)) {
    @unlink($temporary);
    drawFail(503, 'Enregistrement impossible.');
}
flock($lock, LOCK_UN);
fclose($lock);
bearsBackupAfterWrite($private);
echo json_encode(['success' => true, 'version' => hash('sha256', $csv), 'savedAt' => gmdate('c')]);
