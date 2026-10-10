<?php
declare(strict_types=1);
require __DIR__ . '/membres-data.php';
memberSession();
$config = memberConfig();
$_SESSION['members_staff_csrf'] ??= bin2hex(random_bytes(32));
$csrf = $_SESSION['members_staff_csrf'];
$error = '';

function staffFail(int $status, string $message): never
{
    memberJson($status, ['success' => false, 'message' => $message]);
}

function staffPlayer(array $data, string $id): ?array
{
    foreach ($data['players'] as $player) if (($player['id'] ?? '') === $id) return $player;
    return null;
}

function staffPositions(mixed $values, array $allowed, array $current, bool $requiredFirst): array
{
    if (!is_array($values) || count($values) !== 3) staffFail(422, 'Choisis à nouveau les postes.');
    if (($requiredFirst || array_filter($values, static fn ($value): bool => $value !== ''))
        && ($values[0] ?? '') === '') staffFail(422, 'Le premier choix en attaque et en défense est obligatoire.');
    $valid = array_merge($allowed, $current);
    $result = [];
    foreach ($values as $value) {
        if (!is_string($value) || ($value !== '' && !in_array($value, $valid, true))) staffFail(422, 'Poste invalide.');
        if ($value !== '' && in_array($value, $result, true)) staffFail(422, 'Un même poste ne peut être choisi deux fois.');
        if ($value !== '') $result[] = $value;
    }
    return $result;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $submittedCsrf = $_POST['csrf_token'] ?? '';
    if (!is_string($submittedCsrf) || !hash_equals($csrf, $submittedCsrf)) staffFail(403, 'Session expirée. Recharge la page.');
    if ($action === 'login') {
        try {
            memberRateLimit('login', 10, 900);
            $username = $_POST['username'] ?? '';
            $password = $_POST['password'] ?? '';
            if (is_string($username) && is_string($password) && strlen($username) <= 100 && strlen($password) <= 256
                && is_string($config['export_password_hash'] ?? null)
                && hash_equals('coach', $username)
                && password_verify($password, $config['export_password_hash'])) {
                session_regenerate_id(true);
                $_SESSION['members_staff_until'] = time() + 8 * 3600;
                $_SESSION['members_staff_csrf'] = bin2hex(random_bytes(32));
                header('Location: membres-staff.php', true, 303);
                exit;
            }
            http_response_code(401);
            $error = 'Identifiant ou mot de passe incorrect.';
        } catch (Throwable $exception) {
            http_response_code(429);
            $error = $exception->getMessage();
        }
    } elseif ($action === 'logout') {
        unset($_SESSION['members_staff_until'], $_SESSION['members_undo']);
        session_regenerate_id(true);
        header('Location: membres-staff.php', true, 303);
        exit;
    } else {
        if (!memberStaff()) staffFail(401, 'Connexion staff requise.');
        $expected = filter_var($_POST['version'] ?? null, FILTER_VALIDATE_INT);
        if ($expected === false || $expected === null) staffFail(422, 'Version invalide.');
        try {
            $result = memberData($config, static function (array &$data) use ($action, $expected): array {
                if (($data['version'] ?? 0) !== $expected) staffFail(409, 'Le tableau a changé. Recharge la page.');
                $id = $_POST['player_id'] ?? '';
                if (!is_string($id) || !preg_match('/^[a-f0-9]{24}$/', $id)) {
                    if ($action !== 'undo') staffFail(422, 'Joueur invalide.');
                }
                $removedPhoto = null;
                if (in_array($action, ['approve', 'remove', 'edit'], true)) {
                    unset($_SESSION['members_undo']);
                    $found = false;
                    foreach ($data['players'] as $index => &$player) {
                        if ($player['id'] !== $id) continue;
                        $found = true;
                        if ($action === 'approve') $player['approved'] = true;
                        elseif ($action === 'edit') {
                            $firstName = memberText($_POST['first_name'] ?? null, 60);
                            $lastName = memberText($_POST['last_name'] ?? null, 60);
                            $name = $firstName . ' ' . $lastName;
                            $number = memberText($_POST['number'] ?? null, 3);
                            $comment = memberText($_POST['comment'] ?? null, 600);
                            $preference = $_POST['preference'] ?? null;
                            if ($firstName === '' || $lastName === '' || (function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name)) > 100
                                || ($number !== '' && !preg_match('/^\d{1,3}$/', $number))
                                || !in_array($preference, ['attaque', 'defense', 'deux', 'aucune'], true)
                                || !is_string($_POST['comment'] ?? null)
                                || ($_POST['comment'] !== '' && $comment === '')) {
                                staffFail(422, 'Vérifie le prénom, le nom, le numéro, la préférence et le commentaire.');
                            }
                            $offense = staffPositions($_POST['offense'] ?? null, MEMBER_OFFENSE_CHOICES, $player['offense'] ?? [], !empty($player['offense']));
                            $defense = staffPositions($_POST['defense'] ?? null, MEMBER_DEFENSE_CHOICES, $player['defense'] ?? [], !empty($player['defense']));
                            $specialTeams = staffPositions($_POST['special_teams'] ?? null, MEMBER_SPECIAL_TEAMS_CHOICES, $player['special_teams'] ?? [], false);
                            $player['first_name'] = $firstName;
                            $player['last_name'] = $lastName;
                            $player['name'] = $name;
                            $player['number'] = $number;
                            $player['comment'] = $comment;
                            $player['preference'] = $preference;
                            $player['offense'] = $offense;
                            $player['defense'] = $defense;
                            $player['special_teams'] = $specialTeams;
                        } else {
                            $removedPhoto = $player['photo'];
                            unset($data['players'][$index]);
                            $data['players'] = array_values($data['players']);
                            foreach ($data['boards'] as &$board) {
                                foreach ($board as &$slot) foreach (['starter', 'backup'] as $role) {
                                    if ($slot[$role] === $id) $slot[$role] = null;
                                }
                                unset($slot);
                            }
                            unset($board);
                        }
                        break;
                    }
                    unset($player);
                    if (!$found) staffFail(404, 'Joueur introuvable.');
                } elseif ($action === 'move') {
                    $player = staffPlayer($data, $id);
                    if (!$player || empty($player['approved'])) staffFail(422, 'Valide cette réponse avant de placer le joueur.');
                    $unit = $_POST['unit'] ?? '';
                    $position = $_POST['position'] ?? '';
                    $role = $_POST['role'] ?? '';
                    $targetId = $_POST['target_player_id'] ?? '';
                    if (!is_string($unit) || !array_key_exists($unit, MEMBER_UNITS) || !is_string($position)
                        || !is_string($role) || !is_string($targetId)
                        || !in_array($role, ['starter', 'backup', 'sideline'], true)
                        || ($role !== 'sideline' && !in_array($position, MEMBER_UNITS[$unit], true))) {
                        staffFail(422, 'Destination invalide.');
                    }
                    $before = $data['boards'][$unit];
                    $source = null;
                    foreach ($data['boards'][$unit] as $slotPosition => &$slot) {
                        foreach (['starter', 'backup'] as $slotRole) {
                            if (($slot[$slotRole] ?? null) === $id) {
                                $source = [$slotPosition, $slotRole];
                                $slot[$slotRole] = null;
                            }
                        }
                    }
                    unset($slot);
                    if ($role !== 'sideline') {
                        $displaced = $data['boards'][$unit][$position][$role] ?? null;
                        $data['boards'][$unit][$position][$role] = $id;
                        if ($source !== null && $displaced !== null && $displaced !== $id) {
                            $data['boards'][$unit][$source[0]][$source[1]] = $displaced;
                        }
                    } elseif ($targetId !== '') {
                        $target = staffPlayer($data, $targetId);
                        if ($source === null || !$target || empty($target['approved']) || $targetId === $id) {
                            staffFail(422, 'Échange impossible.');
                        }
                        foreach ($data['boards'][$unit] as $slot) {
                            if ($slot['starter'] === $targetId || $slot['backup'] === $targetId) staffFail(422, 'Échange impossible.');
                        }
                        $data['boards'][$unit][$source[0]][$source[1]] = $targetId;
                    }
                    $_SESSION['members_undo'] = ['unit' => $unit, 'board' => $before, 'version' => $expected + 1];
                } elseif ($action === 'undo') {
                    $undo = $_SESSION['members_undo'] ?? null;
                    if (!is_array($undo) || ($undo['version'] ?? null) !== $expected
                        || !isset($data['boards'][$undo['unit']])) staffFail(409, 'Cet échange ne peut plus être annulé.');
                    $data['boards'][$undo['unit']] = $undo['board'];
                    unset($_SESSION['members_undo']);
                } else staffFail(422, 'Action inconnue.');
                $data['version']++;
                return ['data' => $data, 'removed_photo' => $removedPhoto];
            });
            if (is_string($result['removed_photo']) && preg_match('/^[a-f0-9]{24}\.(jpg|png|webp)$/', $result['removed_photo'])) {
                @unlink(memberPrivateDir($config) . '/member-photos/' . $result['removed_photo']);
            }
            bearsBackupAfterWrite(memberPrivateDir($config));
            memberJson(200, ['success' => true, 'data' => $result['data'],
                'undo' => ($_SESSION['members_undo']['version'] ?? null) === $result['data']['version']]);
        } catch (Throwable $exception) {
            staffFail(503, 'Enregistrement indisponible. Réessaie plus tard.');
        }
    }
}

if (isset($_GET['data'])) {
    if (!memberStaff()) staffFail(401, 'Connexion staff requise.');
    try {
        $data = memberData($config);
        memberJson(200, ['success' => true, 'data' => $data,
            'undo' => ($_SESSION['members_undo']['version'] ?? null) === $data['version']]);
    } catch (Throwable $exception) {
        staffFail(503, 'Lecture indisponible.');
    }
}
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" /><title>Staff · Espace membres · Andenne Bears</title>
<link rel="stylesheet" href="bears.css?v=cursor-2026-10-10" /><link rel="stylesheet" href="membres.css?v=<?= substr(hash_file('sha256', __DIR__ . '/membres.css'), 0, 16) ?>" />
<?php if (memberStaff()): ?><script>window.membersConfig = <?= json_encode(['csrf' => $csrf, 'units' => MEMBER_UNITS, 'choices' => ['offense' => MEMBER_OFFENSE_CHOICES, 'defense' => MEMBER_DEFENSE_CHOICES, 'special_teams' => MEMBER_SPECIAL_TEAMS_CHOICES]], JSON_UNESCAPED_UNICODE) ?>;</script><script src="scripts/membres-staff.js?v=<?= substr(hash_file('sha256', __DIR__ . '/scripts/membres-staff.js'), 0, 16) ?>" defer></script><?php endif; ?></head>
<body class="family-page members-page"><header class="family-header"><a class="brand" href="index.html" aria-label="Andenne Bears, accueil"><img src="images/logoBears.png" alt="" /><span>ANDENNE BEARS</span></a><nav class="family-header-actions" aria-label="Navigation"><a href="membres.php">Espace joueurs</a></nav></header>
<main class="family-wrap members-main members-staff-main"><div class="members-heading"><p class="section-kicker">Espace membres · Staff</p><h1>Depth chart Seniors tackle.</h1><p>Les envies des joueurs éclairent les choix du staff. Les compositions restent privées.</p></div>
<?php if (!memberStaff()): ?><div class="members-login"><h2>Accès staff</h2><p>Utilise l’identifiant « coach » et le mot de passe organisateur du site.</p><?php if ($error): ?><p class="members-alert" role="alert"><?= memberEscape($error) ?></p><?php endif; ?><form method="post" action="membres-staff.php" class="contact-form family-form"><input type="hidden" name="action" value="login" /><input type="hidden" name="csrf_token" value="<?= memberEscape($csrf) ?>" /><label class="field">Identifiant<input name="username" autocomplete="username" required /></label><label class="field">Mot de passe<input name="password" type="password" autocomplete="current-password" required /></label><button class="button button-primary" type="submit">Entrer dans l’espace staff</button></form></div>
<?php else: ?><div class="members-staff-toolbar"><p>Réponses et compositions de travail</p><form method="post" action="membres-staff.php"><input type="hidden" name="action" value="logout" /><input type="hidden" name="csrf_token" value="<?= memberEscape($csrf) ?>" /><button class="button" type="submit">Se déconnecter</button></form></div><p id="staff-message" class="members-status" role="status" aria-live="polite"></p>
<div id="members-staff-app" class="members-staff-app" aria-busy="true"><div class="members-tabs" role="group" aria-label="Vue"><button type="button" data-view="responses" aria-pressed="true">Réponses <span id="response-count"></span></button><button type="button" data-view="board" aria-pressed="false">Compositions</button></div>
<section id="members-responses" aria-label="Réponses des joueurs"><div class="members-list-heading"><h2>Souhaits reçus</h2><label>Rechercher un joueur<input id="members-search" type="search" placeholder="Nom ou numéro" /></label></div><p>Les souhaits couvrent l’attaque, la défense et les Special Teams. Valide une réponse avant de placer le joueur sur le terrain. Seuls les profils qui ont accepté la publication apparaissent dans la liste des joueurs.</p><div id="members-response-list" class="members-response-list"></div></section>
<section id="members-board-view" aria-label="Compositions" hidden><div class="members-board-controls"><div id="members-units" class="members-unit-buttons" role="group" aria-label="Unité"></div><button id="members-undo" class="button" type="button" disabled>Annuler le dernier échange</button></div><p id="members-selection-hint">Sélectionne un joueur, puis sa destination. Tu peux aussi le déplacer à la souris.</p><div class="members-board-layout"><div class="members-field-scroll" tabindex="0" role="region" aria-label="Terrain · défilement horizontal sur petit écran"><div id="members-field" class="members-field" aria-label="Terrain"></div></div><aside class="members-sideline"><h2>Sideline</h2><p>Joueurs disponibles pour cette unité.</p><div id="members-sideline-list"></div><button id="members-send-sideline" type="button" class="button" disabled>Envoyer le joueur sélectionné en sideline</button></aside></div></section></div>
<dialog id="members-edit-dialog" class="members-dialog members-edit-dialog" aria-labelledby="members-edit-title"><div class="members-dialog-head"><div><p class="section-kicker">Espace membres · Staff</p><h2 id="members-edit-title">Modifier une inscription</h2></div><button id="members-edit-close" class="members-dialog-close" type="button" aria-label="Fermer sans enregistrer">×</button></div><form id="members-edit-form" class="contact-form family-form members-form"><input type="hidden" name="player_id" /><div class="members-fields members-identity-fields"><label class="field members-identity-field"><span class="members-field-label">Prénom *</span><input name="first_name" maxlength="60" autocomplete="given-name" required /></label><label class="field members-identity-field"><span class="members-field-label">Nom *</span><input name="last_name" maxlength="60" autocomplete="family-name" required /></label><label class="field members-identity-field"><span class="members-field-label">Numéro de maillot</span><input name="number" inputmode="numeric" pattern="[0-9]{1,3}" maxlength="3" /></label></div><div class="members-position-grid"><?php foreach (['offense' => 'Attaque', 'defense' => 'Défense', 'special_teams' => 'Special Teams'] as $key => $label): ?><fieldset class="members-position-group"><legend><?= $label ?></legend><?php for ($rank = 0; $rank < 3; $rank++): $required = $rank === 0 && $key !== 'special_teams'; ?><label class="field"><span class="members-field-label"><?= ['Premier choix', 'Deuxième choix', 'Troisième choix'][$rank] ?><?= $required ? ' *' : '' ?></span><select name="<?= $key ?>[]" data-edit-side="<?= $key ?>" data-edit-rank="<?= $rank ?>"<?= $required ? ' required' : '' ?>></select></label><?php endfor; ?></fieldset><?php endforeach; ?></div><label class="field">Préférence<select name="preference" required><option value="attaque">Attaque</option><option value="defense">Défense</option><option value="deux">Les deux</option><option value="aucune">Pas de préférence</option></select></label><label class="field">Message aux coachs<textarea name="comment" maxlength="600" rows="4"></textarea></label><p class="members-edit-consent-note">Le choix de publication du profil appartient au joueur et reste inchangé.</p><p id="members-edit-message" class="members-status" role="status" aria-live="polite"></p><div class="members-edit-actions"><button class="button button-primary" type="submit">Enregistrer les modifications</button><button id="members-edit-cancel" class="button" type="button">Annuler</button></div></form></dialog><?php endif; ?></main></body></html>
