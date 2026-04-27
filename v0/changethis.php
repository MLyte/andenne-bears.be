<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$configPath = __DIR__ . '/config/changethis-config.php';
if (!is_file($configPath)) {
    json_response(['success' => false, 'message' => 'ChangeThis is not configured.'], 503);
}

$config = require $configPath;
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($origin !== '' && !in_array($origin, $config['allowed_origins'] ?? [], true)) {
    json_response(['success' => false, 'message' => 'Origin is not allowed.'], 403);
}

if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

$payload = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($payload)) {
    json_response(['success' => false, 'message' => 'Invalid JSON payload.'], 400);
}

if (($payload['projectKey'] ?? '') !== ($config['public_key'] ?? '')) {
    json_response(['success' => false, 'message' => 'Unknown project.'], 404);
}

$type = (string) ($payload['type'] ?? '');
if (!in_array($type, ['comment', 'pin', 'screenshot'], true)) {
    json_response(['success' => false, 'message' => 'Invalid feedback type.'], 422);
}

$github = $config['github'] ?? [];
$token = trim((string) ($github['token'] ?? ''));
$owner = trim((string) ($github['owner'] ?? ''));
$repo = trim((string) ($github['repo'] ?? ''));

if ($token === '' || $owner === '' || $repo === '') {
    json_response(['success' => false, 'message' => 'GitHub issue creation is not configured.'], 503);
}

$issue = build_issue_draft($payload, $github['labels'] ?? []);
$result = create_github_issue($owner, $repo, $token, $issue);

json_response([
    'success' => true,
    'message' => 'Feedback received.',
    'issue' => $result,
]);

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function build_issue_draft(array $feedback, array $baseLabels): array
{
    $metadata = is_array($feedback['metadata'] ?? null) ? $feedback['metadata'] : [];
    $pin = is_array($feedback['pin'] ?? null) ? $feedback['pin'] : null;
    $type = (string) ($feedback['type'] ?? 'comment');
    $message = trim((string) ($feedback['message'] ?? ''));
    $path = (string) ($metadata['path'] ?? '/');
    $summary = summarize($message !== '' ? $message : (string) ($pin['text'] ?? 'Retour client'));

    $labels = array_values(array_unique(array_merge($baseLabels, ['mode:' . $type])));

    return [
        'title' => '[Feedback] ' . ($path !== '' ? $path : '/') . ' - ' . $summary,
        'body' => build_issue_body($feedback),
        'labels' => $labels,
    ];
}

function build_issue_body(array $feedback): string
{
    $metadata = is_array($feedback['metadata'] ?? null) ? $feedback['metadata'] : [];
    $viewport = is_array($metadata['viewport'] ?? null) ? $metadata['viewport'] : [];
    $pin = is_array($feedback['pin'] ?? null) ? $feedback['pin'] : null;
    $message = trim((string) ($feedback['message'] ?? ''));
    $hasScreenshot = !empty($feedback['screenshotDataUrl']);

    $technicalPayload = [
        'projectKey' => $feedback['projectKey'] ?? null,
        'type' => $feedback['type'] ?? null,
        'metadata' => $metadata,
        'pin' => $pin,
        'hasScreenshot' => $hasScreenshot,
    ];

    return implode("\n", [
        '## Feedback client',
        '',
        $message !== '' ? '> ' . str_replace("\n", "\n> ", $message) : '> Aucun message fourni.',
        '',
        '## Contexte',
        '',
        '- Page: ' . (($metadata['url'] ?? '') ?: 'Non disponible'),
        '- Chemin: ' . (($metadata['path'] ?? '') ?: 'Non disponible'),
        '- Titre: ' . (($metadata['title'] ?? '') ?: 'Non disponible'),
        '- Mode: ' . (($feedback['type'] ?? '') ?: 'Non disponible'),
        '- Viewport: ' . (($viewport['width'] ?? '?') . 'x' . ($viewport['height'] ?? '?')),
        '- Device pixel ratio: ' . (($metadata['devicePixelRatio'] ?? '') ?: 'Non disponible'),
        '- Langue: ' . (($metadata['language'] ?? '') ?: 'Non disponible'),
        '- Date: ' . (($metadata['createdAt'] ?? '') ?: 'Non disponible'),
        '',
        '## Localisation',
        '',
        $pin ? '- Position: x=' . ($pin['x'] ?? '?') . ', y=' . ($pin['y'] ?? '?') : '- Position: Non applicable',
        !empty($pin['selector']) ? '- Element probable: `' . $pin['selector'] . '`' : '- Element probable: Non disponible',
        !empty($pin['text']) ? '- Texte visible: ' . $pin['text'] : '- Texte visible: Non disponible',
        '',
        '## Donnees techniques',
        '',
        '```json',
        json_encode($technicalPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        '```',
        '',
        '## Capture',
        '',
        $hasScreenshot ? 'Capture recue par l API ChangeThis. Stockage permanent a ajouter si necessaire.' : 'Aucune capture jointe.',
    ]);
}

function summarize(string $value): string
{
    $line = trim((string) preg_split('/\r?\n/', $value)[0]);
    if ($line === '') {
        return 'Retour client';
    }

    return strlen($line) > 72 ? substr($line, 0, 69) . '...' : $line;
}

function create_github_issue(string $owner, string $repo, string $token, array $issue): array
{
    $url = 'https://api.github.com/repos/' . rawurlencode($owner) . '/' . rawurlencode($repo) . '/issues';
    $payload = json_encode($issue, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => github_headers($token),
            CURLOPT_TIMEOUT => 20,
        ]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", github_headers($token)),
                'content' => $payload,
                'timeout' => 20,
                'ignore_errors' => true,
            ],
        ]);
        $body = file_get_contents($url, false, $context);
        $status = parse_response_status($http_response_header ?? []);
        $error = $body === false ? 'GitHub request failed.' : '';
    }

    if ($body === false || $status < 200 || $status >= 300) {
        json_response([
            'success' => false,
            'message' => 'GitHub issue creation failed.',
            'status' => $status,
            'error' => $error,
        ], 502);
    }

    $decoded = json_decode((string) $body, true);
    return [
        'number' => $decoded['number'] ?? null,
        'url' => $decoded['html_url'] ?? null,
    ];
}

function github_headers(string $token): array
{
    return [
        'Accept: application/vnd.github+json',
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
        'User-Agent: andenne-bears-changethis',
        'X-GitHub-Api-Version: 2022-11-28',
    ];
}

function parse_response_status(array $headers): int
{
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
            return (int) $matches[1];
        }
    }

    return 0;
}
