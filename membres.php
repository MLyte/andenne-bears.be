<?php
declare(strict_types=1);
require __DIR__ . '/membres-data.php';
require_once __DIR__ . '/membres-image.php';
memberSession();
$config = memberConfig();
$siteKey = $config['turnstile_site_key'] ?? '';
$secretKey = $config['turnstile_secret_key'] ?? '';
$ready = is_string($siteKey) && $siteKey !== '' && is_string($secretKey) && $secretKey !== '';
$_SESSION['members_player_csrf'] ??= bin2hex(random_bytes(32));
$csrf = $_SESSION['members_player_csrf'];

function playerFail(int $status, string $message): never
{
    memberJson($status, ['success' => false, 'message' => $message]);
}

function playerPosition(string $name, array $allowed, bool $requiredFirst = false): array
{
    $values = $_POST[$name] ?? [];
    if (!is_array($values) || count($values) !== 3) playerFail(422, 'Choisis à nouveau tes postes.');
    if ($requiredFirst && ($values[0] ?? '') === '') playerFail(422, 'Le premier choix en attaque et en défense est obligatoire.');
    $result = [];
    foreach ($values as $value) {
        if (!is_string($value) || ($value !== '' && !in_array($value, $allowed, true))) playerFail(422, 'Poste invalide.');
        if ($value !== '' && in_array($value, $result, true)) playerFail(422, 'Un même poste ne peut être choisi deux fois.');
        if ($value !== '') $result[] = $value;
    }
    return $result;
}

function playerCaptcha(string $secret): bool
{
    $token = $_POST['cf-turnstile-response'] ?? '';
    if (!is_string($token) || $token === '' || strlen($token) > 2048) return false;
    $fields = http_build_query(['secret' => $secret, 'response' => $token]);
    $response = false;
    if (function_exists('curl_init')) {
        $curl = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
        curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $fields, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 8, CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded']]);
        $response = curl_exec($curl);
        curl_close($curl);
    } else {
        $context = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $fields, 'timeout' => 8, 'ignore_errors' => true]]);
        $response = @file_get_contents('https://challenges.cloudflare.com/turnstile/v0/siteverify', false, $context);
    }
    $result = is_string($response) ? json_decode($response, true) : null;
    return is_array($result) && ($result['success'] ?? false) === true
        && in_array($result['hostname'] ?? '', ['andenne-bears.be', 'www.andenne-bears.be'], true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!$ready) playerFail(503, 'Le formulaire est temporairement indisponible.');
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 5 * 1024 * 1024) playerFail(413, 'Envoi trop volumineux : photo de 4 Mo maximum.');
        memberRateLimit('submit', 6, 3600);
        $submittedCsrf = $_POST['csrf_token'] ?? '';
        if (!is_string($submittedCsrf) || !hash_equals($csrf, $submittedCsrf)) playerFail(403, 'Session expirée. Recharge la page.');
        if (($_POST['website'] ?? '') !== '') playerFail(422, 'Envoi refusé.');
        $firstName = memberText($_POST['first_name'] ?? '', 60);
        $lastName = memberText($_POST['last_name'] ?? '', 60);
        $name = $firstName . ' ' . $lastName;
        $number = memberText($_POST['number'] ?? '', 3);
        $comment = memberText($_POST['comment'] ?? '', 600);
        $preference = $_POST['preference'] ?? '';
        $publicProfile = ($_POST['public_profile'] ?? '') === 'yes';
        $offense = playerPosition('offense', MEMBER_OFFENSE_CHOICES, true);
        $defense = playerPosition('defense', MEMBER_DEFENSE_CHOICES, true);
        $specialTeams = playerPosition('special_teams', MEMBER_SPECIAL_TEAMS_CHOICES);
        if ($firstName === '' || $lastName === '' || (function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name)) > 100
            || ($number !== '' && !preg_match('/^\d{1,3}$/', $number))
            || !in_array($preference, ['attaque', 'defense', 'deux', 'aucune'], true)) playerFail(422, 'Complète ton prénom, ton nom et ta préférence.');
        $photo = $_FILES['photo'] ?? null;
        $photoInfo = null;
        if (is_array($photo) && ($photo['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            if ($photo['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($photo['tmp_name']) || $photo['size'] > 4 * 1024 * 1024) {
                playerFail(422, 'La photo doit faire au maximum 4 Mo.');
            }
            $image = @getimagesize($photo['tmp_name']);
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($photo['tmp_name']);
            $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
            if (!is_array($image) || !isset($types[$mime]) || $image['mime'] !== $mime
                || $image[0] < 128 || $image[1] < 128 || $image[0] > 6000 || $image[1] > 6000
                || $image[0] * $image[1] > 20_000_000) {
                playerFail(422, 'Choisis une photo JPG, PNG ou WebP valide.');
            }
            $photoInfo = ['tmp' => $photo['tmp_name'], 'mime' => $mime];
        }
        if (!playerCaptcha($secretKey)) playerFail(422, 'Vérification anti-robot échouée ou expirée. Réessaie.');
        $private = memberPrivateDir($config);
        $id = bin2hex(random_bytes(12));
        $photoName = null;
        if ($photoInfo !== null) {
            $photoDir = $private . DIRECTORY_SEPARATOR . 'member-photos';
            if (!is_dir($photoDir) && !mkdir($photoDir, 0700) && !is_dir($photoDir)) throw new RuntimeException('Photo indisponible.');
            try {
                $photoName = memberSavePortrait($photoInfo['tmp'], $photoInfo['mime'], $photoDir, $id);
            } catch (InvalidArgumentException $error) {
                playerFail(422, 'Cette photo ne peut pas être lue. Choisis un autre fichier.');
            }
        }
        try {
            memberData($config, static function (array &$data) use ($id, $firstName, $lastName, $name, $number, $comment, $preference, $offense, $defense, $specialTeams, $photoName, $publicProfile): void {
                $data['players'][] = ['id' => $id, 'created_at' => gmdate('c'), 'first_name' => $firstName,
                    'last_name' => $lastName, 'name' => $name, 'number' => $number,
                    'offense' => $offense, 'defense' => $defense, 'special_teams' => $specialTeams,
                    'preference' => $preference, 'comment' => $comment, 'public_profile' => $publicProfile,
                    'photo' => $photoName, 'approved' => false];
            });
        } catch (Throwable $error) {
            if ($photoName !== null) @unlink($photoDir . DIRECTORY_SEPARATOR . $photoName);
            throw $error;
        }
        bearsBackupAfterWrite($private);
        $_SESSION['members_player_csrf'] = bin2hex(random_bytes(32));
        memberJson(200, ['success' => true, 'message' => 'Merci ! Tes souhaits ont été transmis au staff.']);
    } catch (Throwable $error) {
        playerFail(503, 'Enregistrement indisponible. Réessaie plus tard.');
    }
}
$publicProfiles = null;
try {
    $stored = memberData($config);
    $publicProfiles = array_values(array_filter($stored['players'], static fn (array $player): bool =>
        !empty($player['approved']) && !empty($player['public_profile'])));
    usort($publicProfiles, static fn (array $a, array $b): int => strnatcasecmp($a['name'], $b['name']));
} catch (Throwable $error) {
    // The public page still loads if private storage is temporarily unavailable.
}
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" /><title>Le fil des Bears · Espace membres</title>
<meta name="description" content="Retrouve les actus des Andenne Bears, les prochains rendez-vous et indique tes postes préférés en Seniors tackle." />
<meta property="og:type" content="website" />
<meta property="og:locale" content="fr_BE" />
<meta property="og:site_name" content="Andenne Bears" />
<meta property="og:title" content="Le fil des Bears · Espace membres" />
<meta property="og:description" content="Tes postes, tes actus, ton équipe. Retrouve l’espace membres des Andenne Bears." />
<meta property="og:url" content="https://www.andenne-bears.be/membres.php" />
<meta property="og:image" content="https://www.andenne-bears.be/images/members-share-2026.jpg" />
<meta property="og:image:secure_url" content="https://www.andenne-bears.be/images/members-share-2026.jpg" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Les Andenne Bears entrent sur le terrain. Espace membres : le fil des Bears." />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Le fil des Bears · Espace membres" />
<meta name="twitter:description" content="Tes postes, tes actus, ton équipe." />
<meta name="twitter:image" content="https://www.andenne-bears.be/images/members-share-2026.jpg" />
<link rel="stylesheet" href="bears.css?v=secondary-2026-10-10" /><link rel="stylesheet" href="membres.css?v=identity-fields-1" />
<?php if ($ready): ?><script id="members-turnstile-script" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script><?php endif; ?>
<script src="scripts/membres-player.js?v=photo-optimized-1" defer></script></head>
<body class="family-page members-page">
<header class="family-header"><a class="brand" href="index.html" aria-label="Andenne Bears, accueil"><img src="images/logoBears.png" alt="" /><span>ANDENNE BEARS</span></a><nav class="family-header-actions" aria-label="Navigation"><a href="index.html">Accueil</a><a href="membres-staff.php">Accès staff</a></nav></header>
<main class="family-wrap members-main"><div class="members-heading"><p class="section-kicker">Espace membres</p><h1>Le fil des Bears.</h1><p>Les infos du club, les prochains rendez-vous et les demandes du staff, au même endroit.</p></div>
<section class="members-feed" aria-labelledby="members-feed-title"><div class="members-feed-heading"><h2 id="members-feed-title">À la une</h2><span>Vie du club · 2026</span></div>
<article class="members-news-card members-news-card-featured"><div class="members-news-copy"><p class="members-news-meta"><span class="members-news-dot" aria-hidden="true"></span> En cours · Seniors tackle</p><h3>Quels postes aimerais-tu jouer ?</h3><p>Le staff prépare les prochaines compositions de l’équipe Seniors tackle, en attaque, en défense et en Special Teams. Indique tes envies, ta préférence entre attaque et défense et ajoute une photo si tu le souhaites.</p><p class="members-news-note">Ce sont des souhaits : les coachs décideront des postes sur le terrain.</p><div class="members-news-actions"><?php if ($ready): ?><button id="members-open-form" class="button button-primary" type="button" aria-haspopup="dialog" aria-controls="members-depth-dialog">Indiquer mes envies</button><?php else: ?><p class="members-news-unavailable">Le formulaire ouvrira bientôt.</p><?php endif; ?><button id="members-open-roster" class="button button-secondary" type="button" aria-haspopup="dialog" aria-controls="members-roster-dialog">Afficher les joueurs</button></div></div><div class="members-news-visual" aria-hidden="true"><span>OFFENSE</span><span>QB</span><span>RB</span><span>WR</span><span>DEFENSE</span><span>LB</span><span>CB</span><span>DL</span></div></article>
<div class="members-news-grid"><article class="members-news-card members-event-card"><img src="images/family-day-social-2026.png" alt="" loading="lazy" /><div class="members-event-copy"><p class="members-news-meta">25 octobre 2026 · Évelette</p><h3>Une journée Bears à partager</h3><p>Tournoi de flag, repas et NFL Paris Game : retrouve le programme et les informations pratiques.</p><a class="members-news-link" href="journee-familiale.html">Voir la journée du 25 octobre <span aria-hidden="true">↗</span></a></div></article><article class="members-news-card members-event-card"><img src="images/camp-blegny-share-2026.jpg" alt="" loading="lazy" /><div class="members-event-copy"><p class="members-news-meta">11 au 13 décembre 2026 · Blégny</p><h3>Camp Bears</h3><p>Trois jours de football et de vie d’équipe. Consulte le programme et les modalités d’inscription.</p><a class="members-news-link" href="camp-blegny.html">Découvrir le camp <span aria-hidden="true">↗</span></a></div></article></div>
</section>
<dialog id="members-roster-dialog" class="members-dialog members-roster-dialog" aria-labelledby="members-roster-title" aria-describedby="members-roster-intro"><div class="members-dialog-head"><div><p class="section-kicker">Espace membres · Seniors tackle</p><h2 id="members-roster-title">Les joueurs inscrits</h2><p id="members-roster-intro">Les joueurs Seniors tackle qui ont choisi d’apparaître ici et dont le profil a été validé par le staff.</p></div><button class="members-dialog-close" type="button" data-close-members-roster aria-label="Fermer la liste des joueurs">×</button></div><div class="members-roster-content"><p class="members-roster-count"><?= $publicProfiles === null ? 'Liste indisponible' : count($publicProfiles) . ' profil' . (count($publicProfiles) > 1 ? 's' : '') ?></p>
<?php if ($publicProfiles === null): ?><p class="members-empty">La liste est temporairement indisponible.</p>
<?php elseif (!$publicProfiles): ?><p class="members-empty">Aucun profil publié pour le moment.</p>
<?php else: ?><div class="members-public-list"><?php foreach ($publicProfiles as $player): ?><article class="members-public-player"><div class="members-public-portrait"><?php if (!empty($player['photo']) && preg_match('/^[a-f0-9]{24}\.(jpg|png|webp)$/', $player['photo'])): ?><img src="membres-photo.php?id=<?= memberEscape($player['id']) ?>" alt="Portrait de <?= memberEscape($player['name']) ?>" loading="lazy" /><?php else: ?><img src="images/bears-player-placeholder.svg" alt="Illustration d’un ours en casque et épaulières" loading="lazy" /><?php endif; ?></div><div class="members-public-details"><h3><?= memberEscape($player['name']) ?></h3><dl><?php foreach (['Attaque' => ($player['offense'] ?? []), 'Défense' => ($player['defense'] ?? []), 'Special Teams' => ($player['special_teams'] ?? [])] as $label => $choices): ?><div><dt><?= $label ?></dt><dd><?= $choices ? memberEscape(implode(' · ', $choices)) : '—' ?></dd></div><?php endforeach; ?></dl></div></article><?php endforeach; ?></div><?php endif; ?></div></dialog>
<?php if ($ready): ?><dialog id="members-depth-dialog" class="members-dialog" aria-labelledby="members-dialog-title" aria-describedby="members-dialog-intro"><div class="members-dialog-head"><div><p class="section-kicker">Seniors tackle · Tes souhaits</p><h2 id="members-dialog-title">Où veux-tu jouer ?</h2><p id="members-dialog-intro">Ce formulaire concerne l’équipe Seniors tackle. Choisis tes postes préférés pour aider le staff à préparer les compositions.</p></div><button class="members-dialog-close" type="button" data-close-members-dialog aria-label="Fermer le formulaire">×</button></div>
<form id="members-form" class="contact-form family-form members-form" action="membres.php" method="post" enctype="multipart/form-data">
<input type="hidden" name="csrf_token" value="<?= memberEscape($csrf) ?>" /><div class="members-honeypot" aria-hidden="true"><label>Site web<input name="website" tabindex="-1" autocomplete="off" /></label></div>
<section class="members-step" aria-labelledby="identity-title"><span class="members-step-number">01 / 04</span><h2 id="identity-title">Ton profil</h2><div class="members-fields members-identity-fields"><label class="field members-identity-field"><span class="members-field-label">Prénom <span aria-hidden="true">*</span></span><input name="first_name" maxlength="60" autocomplete="given-name" required /></label><label class="field members-identity-field"><span class="members-field-label">Nom <span aria-hidden="true">*</span></span><input name="last_name" maxlength="60" autocomplete="family-name" required /></label><label class="field members-identity-field"><span class="members-field-label">Numéro de maillot désiré <span class="members-optional members-field-hint">OL/DL : entre 50 et 79</span></span><input name="number" inputmode="numeric" pattern="[0-9]{1,3}" maxlength="3" /></label></div></section>
<section class="members-step" aria-labelledby="positions-title"><span class="members-step-number">02 / 04</span><h2 id="positions-title">Tes postes</h2><p>Choisis un premier poste en attaque et en défense. Tu peux ajouter deux autres envies par unité ; les Special Teams restent facultatives.</p><div class="members-position-grid">
<?php foreach (['offense' => ['Attaque', MEMBER_OFFENSE_CHOICES], 'defense' => ['Défense', MEMBER_DEFENSE_CHOICES], 'special_teams' => ['Special Teams', MEMBER_SPECIAL_TEAMS_CHOICES]] as $key => $group): ?><fieldset class="members-position-group"><legend><?= $group[0] ?></legend><?php for ($rank = 1; $rank <= 3; $rank++): $mandatory = $rank === 1 && $key !== 'special_teams'; ?><label class="field" for="<?= $key . $rank ?>"><span class="members-field-label"><?= $rank === 1 ? 'Premier choix' : ($rank === 2 ? 'Deuxième choix' : 'Troisième choix') ?><?php if ($mandatory): ?> <span aria-hidden="true">*</span><?php endif; ?></span><select id="<?= $key . $rank ?>" name="<?= $key ?>[]"<?= $mandatory ? ' required' : '' ?>><option value=""><?= $mandatory ? 'Choisir un poste' : 'Aucun' ?></option><?php foreach ($group[1] as $position): ?><option value="<?= memberEscape($position) ?>"><?= memberEscape($position) ?></option><?php endforeach; ?></select></label><?php endfor; ?></fieldset><?php endforeach; ?></div></section>
<section class="members-step" aria-labelledby="preference-title"><span class="members-step-number">03 / 04</span><h2 id="preference-title">Ta préférence</h2><fieldset class="members-radio-group"><legend>Si tu devais choisir, tu préfères…</legend><?php foreach (['attaque' => 'L’attaque', 'defense' => 'La défense', 'deux' => 'Les deux', 'aucune' => 'Pas de préférence'] as $value => $label): ?><label><input type="radio" name="preference" value="<?= $value ?>" required /><span><?= $label ?></span></label><?php endforeach; ?></fieldset><label class="field">Un mot pour les coachs <span class="members-optional">facultatif</span><textarea name="comment" maxlength="600" rows="4" placeholder="Un poste à découvrir, une envie particulière…"></textarea></label></section>
<section class="members-step" aria-labelledby="photo-title"><span class="members-step-number">04 / 04</span><h2 id="photo-title">Ta photo et ta visibilité</h2><p>Une photo de profil aide le staff à reconnaître les joueurs sur le tableau. Elle est facultative.</p><div class="members-photo-picker"><img id="members-photo-preview" alt="Aperçu de ta photo" hidden /><label class="field">Choisir une photo <span class="members-optional">JPG, PNG ou WebP · 4 Mo max.</span><input id="members-photo" type="file" name="photo" accept="image/jpeg,image/png,image/webp" /></label></div><label class="members-public-consent"><input type="checkbox" name="public_profile" value="yes" /><span>J’accepte que mon nom, ma photo si j’en ai ajouté une et mes choix de postes soient affichés sur la liste de l’espace membres après validation par le staff. Cette page est accessible sans connexion.</span></label><p class="members-consent-note">Tu peux transmettre tes souhaits sans apparaître sur cette liste.</p></section>
<div class="members-submit"><div id="members-turnstile" data-sitekey="<?= memberEscape($siteKey) ?>"></div><p id="members-message" role="status" aria-live="polite"></p><button class="button button-primary" type="submit">Transmettre mes souhaits</button><p>Les réponses non publiées restent réservées au staff. Ces choix ne constituent pas une attribution de poste.</p></div>
</form><div id="members-success" class="members-success" hidden tabindex="-1"><h3>Merci, c’est envoyé.</h3><p>Tes souhaits ont été transmis au staff. Les coachs prépareront les compositions à partir de toutes les réponses.</p><button class="button button-primary" type="button" data-close-members-dialog>Fermer</button></div></dialog><?php endif; ?></main></body></html>
