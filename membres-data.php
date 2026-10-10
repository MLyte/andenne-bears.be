<?php
declare(strict_types=1);

require_once __DIR__ . '/private-backup.php';

const MEMBER_OFFENSE = ['QB', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'];
const MEMBER_DEFENSE = ['DE1', 'DT1', 'DT2', 'DE2', 'LB1', 'LB2', 'LB3', 'CB1', 'CB2', 'FS', 'SS'];
const MEMBER_OFFENSE_CHOICES = ['QB', 'RB', 'WR', 'TE', 'Tackle/Guard', 'Center', 'Fullback'];
const MEMBER_DEFENSE_CHOICES = ['DL', 'LB', 'CB', 'Safety'];
const MEMBER_SPECIAL_TEAMS_CHOICES = ['Returner', 'Kicker', 'Punter', 'Holder', 'Long snapper'];
const MEMBER_UNITS = [
    'attaque' => MEMBER_OFFENSE,
    'defense' => MEMBER_DEFENSE,
    'kickoff' => ['K', 'L1', 'L2', 'L3', 'L4', 'L5', 'R1', 'R2', 'R3', 'R4', 'R5'],
    'kick_return' => ['KR1', 'KR2', 'FB', 'L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'],
    'punt' => ['P', 'LS', 'PP', 'L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'],
    'punt_return' => ['PR', 'L1', 'L2', 'L3', 'L4', 'L5', 'R1', 'R2', 'R3', 'R4', 'R5'],
    'field_goal' => ['K', 'H', 'LS', 'LT', 'LG', 'C', 'RG', 'RT', 'L', 'R', 'B'],
];

function memberConfig(): array
{
    $baseFile = __DIR__ . '/config/family-day-config.php';
    $base = is_file($baseFile) ? require $baseFile : [];
    $extraFile = __DIR__ . '/config/members-config.php';
    $extra = is_file($extraFile) ? require $extraFile : [];
    return array_merge(is_array($base) ? $base : [], is_array($extra) ? $extra : []);
}

function memberPrivateDir(array $config): string
{
    $path = $config['storage_dir'] ?? '';
    $private = is_string($path) ? realpath($path) : false;
    $root = realpath(__DIR__);
    if ($private === false || $root === false || !is_writable($private)
        || str_starts_with($private . DIRECTORY_SEPARATOR, $root . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Stockage privé indisponible.');
    }
    return $private;
}

function memberEmptyData(): array
{
    $boards = [];
    foreach (MEMBER_UNITS as $unit => $positions) {
        $boards[$unit] = [];
        foreach ($positions as $position) $boards[$unit][$position] = ['starter' => null, 'backup' => null];
    }
    return ['version' => 1, 'players' => [], 'boards' => $boards];
}

function memberData(array $config, ?callable $change = null): mixed
{
    $path = memberPrivateDir($config) . DIRECTORY_SEPARATOR . 'members-depth-chart.json';
    if (is_link($path)) throw new RuntimeException('Stockage privé indisponible.');
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, $change ? LOCK_EX : LOCK_SH)) {
        throw new RuntimeException('Stockage privé indisponible.');
    }
    try {
        $raw = stream_get_contents($handle);
        if ($raw === false) throw new RuntimeException('Lecture indisponible.');
        $data = $raw === '' ? memberEmptyData() : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data) || !isset($data['players'], $data['boards'])) {
            throw new RuntimeException('Données membres invalides.');
        }
        if ($change === null) return $data;
        $result = $change($data);
        $encoded = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        rewind($handle);
        if (!ftruncate($handle, 0) || fwrite($handle, $encoded) !== strlen($encoded) || !fflush($handle)) {
            throw new RuntimeException('Enregistrement impossible.');
        }
        return $result;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function memberText(mixed $value, int $limit): string
{
    if (!is_string($value)) return '';
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    return $length <= $limit ? $value : '';
}

function memberEscape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function memberJson(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function memberSession(): void
{
    ini_set('session.use_strict_mode', '1');
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    if (!$https && !$local) {
        http_response_code(403);
        exit('Connexion HTTPS requise.');
    }
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
}

function memberStaff(): bool
{
    return ($_SESSION['members_staff_until'] ?? 0) > time();
}

function memberRateLimit(string $scope, int $max, int $seconds): void
{
    $path = sys_get_temp_dir() . '/bears-members-' . $scope . '-' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) throw new RuntimeException('Vérification temporairement indisponible.');
    try {
        $raw = stream_get_contents($handle);
        $times = json_decode($raw ?: '[]', true);
        if (!is_array($times)) $times = [];
        $times = array_values(array_filter($times, static fn ($time): bool => is_int($time) && $time > time() - $seconds));
        if (count($times) >= $max) throw new RuntimeException('Trop de tentatives. Réessaie plus tard.');
        $times[] = time();
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($times));
        fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}
