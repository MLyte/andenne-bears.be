<?php

declare(strict_types=1);

ini_set('session.use_strict_mode', '1');

$isHttps = (
    (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
);

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);

session_start();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");

function jsonResponse(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function clientIp(): string
{
    return trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown')) ?: 'unknown';
}

function textLength(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value);
    }

    return strlen($value);
}

function securityLog(string $event, array $context = []): void
{
    $safeContext = [
        'ip_hash' => hash('sha256', clientIp()),
        'ua_hash' => hash('sha256', (string) ($_SERVER['HTTP_USER_AGENT'] ?? '')),
    ];

    foreach ($context as $key => $value) {
        if (is_scalar($value)) {
            $safeContext[$key] = (string) $value;
        }
    }

    error_log('[contact_security] ' . $event . ' ' . json_encode($safeContext, JSON_UNESCAPED_UNICODE));
}

function applyRateLimit(int $limit, int $windowSeconds, string $scope = 'contact'): void
{
    $ip = clientIp();
    $rateDir = sys_get_temp_dir() . '/ml-contact-rate';

    if (!is_dir($rateDir) && !mkdir($rateDir, 0775, true) && !is_dir($rateDir)) {
        securityLog('rate_limit_storage_unavailable');
        return;
    }

    $rateFile = $rateDir . '/' . hash('sha256', $scope . '|' . $ip) . '.json';
    $now = time();

    $entries = [];
    if (is_file($rateFile)) {
        $decoded = json_decode((string) file_get_contents($rateFile), true);
        if (is_array($decoded)) {
            $entries = $decoded;
        }
    }

    $entries = array_values(array_filter($entries, static fn ($timestamp): bool => is_int($timestamp) && $timestamp >= ($now - $windowSeconds)));
    if (count($entries) >= $limit) {
        securityLog('rate_limit_blocked', ['count' => count($entries)]);
        jsonResponse(429, [
            'success' => false,
            'message' => 'Trop de tentatives. Réessayez dans quelques minutes.',
        ]);
    }

    $entries[] = $now;
    file_put_contents($rateFile, json_encode($entries), LOCK_EX);
}

if (isset($_GET['csrf'])) {
    applyRateLimit(30, 600, 'csrf');
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    jsonResponse(200, [
        'success' => true,
        'csrfToken' => $_SESSION['csrf_token'],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, [
        'success' => false,
        'message' => 'Méthode non autorisée.',
    ]);
}

applyRateLimit(6, 600, 'submit');

$configPath = __DIR__ . '/config/contact-config.php';
if (!file_exists($configPath)) {
    securityLog('missing_config');
    jsonResponse(500, [
        'success' => false,
        'message' => 'Configuration manquante.',
    ]);
}

$config = require $configPath;
$recipientEmail = $config['recipient_email'] ?? '';
$recipientName = is_string($config['recipient_name'] ?? null)
    ? trim(str_replace(["\r", "\n"], '', $config['recipient_name']))
    : 'Contact';
$recipientName = $recipientName !== '' ? $recipientName : 'Contact';
$senderEmail = is_string($config['sender_email'] ?? null) ? $config['sender_email'] : $recipientEmail;
$senderName = is_string($config['sender_name'] ?? null)
    ? trim(str_replace(["\r", "\n"], '', $config['sender_name']))
    : $recipientName;
$senderName = $senderName !== '' ? $senderName : $recipientName;

if (!is_string($recipientEmail) || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
    securityLog('invalid_recipient');
    jsonResponse(500, [
        'success' => false,
        'message' => 'Adresse de réception invalide côté serveur.',
    ]);
}

if (!filter_var($senderEmail, FILTER_VALIDATE_EMAIL)) {
    $senderEmail = $recipientEmail;
}

$csrfToken = trim((string) ($_POST['csrf_token'] ?? ''));
$sessionToken = (string) ($_SESSION['csrf_token'] ?? '');
if ($sessionToken === '' || !hash_equals($sessionToken, $csrfToken)) {
    securityLog('csrf_mismatch');
    jsonResponse(403, [
        'success' => false,
        'message' => 'Session invalide. Rechargez la page puis réessayez.',
    ]);
}
unset($_SESSION['csrf_token']);

$formContext = trim((string) ($_POST['form_context'] ?? ''));
$isBearsForm = $formContext === 'bears';
$name = trim((string) ($_POST[$isBearsForm ? 'Nom' : 'name'] ?? ''));
$email = trim((string) ($_POST['email'] ?? ''));
$message = trim((string) ($_POST[$isBearsForm ? 'Message' : 'message'] ?? ''));
$honeypot = trim((string) ($_POST['company'] ?? ''));
$formStart = (string) ($_POST['form_start'] ?? '0');

if ($honeypot !== '') {
    securityLog('honeypot_triggered');
    jsonResponse(200, [
        'success' => true,
        'message' => 'Message envoyé.',
    ]);
}

$formStartMs = (int) $formStart;
$elapsedMs = (int) (microtime(true) * 1000) - $formStartMs;
if ($formStartMs <= 0 || $elapsedMs < 2500) {
    securityLog('antibot_rejected', ['elapsed_ms' => $elapsedMs]);
    jsonResponse(422, [
        'success' => false,
        'message' => 'Validation anti-spam refusée.',
    ]);
}

if ($name === '' || textLength($name) < 2) {
    jsonResponse(422, [
        'success' => false,
        'message' => 'Merci de renseigner votre nom.',
    ]);
}

$cleanName = str_replace(["\r", "\n"], '', $name);
$cleanEmail = str_replace(["\r", "\n"], '', $email);

if ($isBearsForm) {
    $profileLabels = [
        'essai' => 'Je veux essayer',
        'parent' => 'Question parent',
        'partenariat' => 'Partenariat',
        'benevolat' => 'Bénévolat',
        'autre' => 'Autre demande',
    ];
    $channelLabels = [
        'messenger' => 'Messenger',
        'instagram' => 'Instagram',
        'telephone' => 'Téléphone',
        'email' => 'Email',
    ];
    $messageRequiredProfiles = ['parent', 'partenariat', 'benevolat', 'autre'];

    $profile = trim((string) ($_POST['Profil'] ?? 'essai'));
    $age = trim((string) ($_POST['Age'] ?? ''));
    $channel = trim((string) ($_POST['Canal prefere'] ?? 'messenger'));
    $contact = trim((string) ($_POST['Contact'] ?? ''));
    $profileLabel = $profileLabels[$profile] ?? 'Autre demande';
    $channelLabel = $channelLabels[$channel] ?? 'Contact';

    if ($profile === 'essai' && ($age === '' || !ctype_digit($age))) {
        jsonResponse(422, [
            'success' => false,
            'message' => 'Merci de renseigner un âge valide.',
        ]);
    }

    if ($contact === '' || textLength($contact) < 2) {
        jsonResponse(422, [
            'success' => false,
            'message' => 'Merci de renseigner une coordonnée de contact.',
        ]);
    }

    if ($channel === 'email') {
        if (!filter_var($contact, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(422, [
                'success' => false,
                'message' => 'Adresse email invalide.',
            ]);
        }
        $cleanEmail = str_replace(["\r", "\n"], '', $contact);
    }

    if (in_array($profile, $messageRequiredProfiles, true) && ($message === '' || textLength($message) < 20)) {
        jsonResponse(422, [
            'success' => false,
            'message' => 'Votre message doit contenir au moins 20 caractères.',
        ]);
    }

    $cleanAge = str_replace(["\r", "\n"], '', $age);
    $cleanContact = str_replace(["\r", "\n"], '', $contact);
    $subject = 'Nouvelle demande Andenne Bears - ' . $profileLabel;
    $body = "Nom : {$cleanName}\n";
    $body .= "Profil : {$profileLabel}\n";
    $body .= $cleanAge !== '' ? "Âge : {$cleanAge}\n" : "Âge : non renseigné\n";
    $body .= "Contact souhaité : {$channelLabel} ({$cleanContact})\n\n";
    $body .= "Message :\n" . ($message !== '' ? $message : 'Non renseigné.') . "\n";
    $body .= "\n---\nEnvoyé depuis le formulaire du site Andenne Bears.";
} else {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(422, [
            'success' => false,
            'message' => 'Adresse email invalide.',
        ]);
    }

    if ($message === '' || textLength($message) < 20) {
        jsonResponse(422, [
            'success' => false,
            'message' => 'Votre message doit contenir au moins 20 caractères.',
        ]);
    }

    $subject = 'Nouveau message depuis le site';
    $body = "Nom : {$cleanName}\n";
    $body .= "Email : {$cleanEmail}\n\n";
    $body .= "Message :\n{$message}\n";
    $body .= "\n---\nEnvoyé depuis le formulaire du site.";
}

$replyToEmail = filter_var($cleanEmail, FILTER_VALIDATE_EMAIL) ? $cleanEmail : $senderEmail;
$returnPath = filter_var($senderEmail, FILTER_VALIDATE_EMAIL) ? $senderEmail : $recipientEmail;

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    sprintf('From: %s <%s>', $senderName, $senderEmail),
    sprintf('Reply-To: %s <%s>', $cleanName, $replyToEmail),
];

$sent = @mail($recipientEmail, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers), '-f ' . $returnPath);

if (!$sent) {
    securityLog('mail_send_failed');
    jsonResponse(500, [
        'success' => false,
        'message' => "Le serveur n'a pas pu envoyer le message. Réessayez plus tard.",
    ]);
}

securityLog('mail_sent');
jsonResponse(200, [
    'success' => true,
    'message' => 'Merci, votre message a bien été envoyé.',
]);
