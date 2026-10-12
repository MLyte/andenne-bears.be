<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/bears-migration.php';
require_once dirname(__DIR__) . '/private-backup.php';

function checkStorage(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function testStorageFormats(): array
{
    $family = ['ABCDEF1234', '2026-10-12T12:00:00+00:00', 'Élodie "Test"; O’Neil', 'test@example.invalid', 'non', '', 'oui', 'non', 'oui', 'non', 'oui', '', ''];
    $camp = ['1234ABCDEF', '2026-10-12T12:00:00+00:00', 'Test', 'Élodie', 'Senior', "Ligne 1\nLigne 2; sans gluten", '', '', 'oui'];
    foreach (['family' => $family, 'camp' => $camp] as $dataset => $row) {
        checkStorage(bearsParseCsv($dataset, bearsRowsCsv($dataset, [$row])) === [$row], 'Round trip');
        foreach (bearsDataset($dataset)['legacy'] as $width) {
            $stream = fopen('php://temp', 'w+');
            fputcsv($stream, array_slice(bearsDataset($dataset)['header'], 0, $width), ';', '"', '\\');
            fputcsv($stream, array_slice($row, 0, $width), ';', '"', '\\');
            rewind($stream);
            checkStorage(bearsParseCsv($dataset, stream_get_contents($stream)) === [$row], 'Legacy normalization');
            fclose($stream);
        }
    }
    $rejected = 0;
    foreach ([bearsRowsCsv('family', [$family, $family]), "wrong;header\n", bearsRowsCsv('family', [array_slice($family, 0, 10)])] as $csv) {
        try { bearsParseCsv('family', $csv); } catch (RuntimeException) { $rejected++; }
    }
    checkStorage($rejected === 3, 'Reject malformed/duplicate import');
    return [$family, $camp];
}

/** All SQL tables are TEMPORARY and vanish on disconnect. No real rows are touched. */
function testStorageMysql(string $private): array
{
    [$family, $camp] = testStorageFormats();
    $pdo = bearsDatabase($private);
    bearsCreateSchema($pdo, true);
    foreach (['family', 'camp', 'teams'] as $dataset) {
        $pdo->prepare('INSERT INTO bears_dataset_state VALUES (?, 0, ?)')->execute([$dataset, hash('sha256', '')]);
    }
    checkStorage(bearsReadRows($private, 'family') === null, 'Missing data');
    bearsAppendRow($private, 'family', $family);
    bearsAppendRow($private, 'camp', $camp);
    checkStorage(bearsReadRows($private, 'family') === [$family], 'Exact family insert');
    checkStorage(bearsReadRows($private, 'camp') === [$camp], 'Exact camp insert');
    $version = hash('sha256', json_encode($family, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE));
    bearsUpdateRow($private, 'family', $family[0], $version, [8 => '7']);
    try {
        bearsUpdateRow($private, 'family', $family[0], $version, [8 => '9']);
        throw new LogicException('Stale edit accepted');
    } catch (RuntimeException $error) { checkStorage($error->getCode() === 409, 'Stale conflict'); }
    checkStorage(bearsReadRows($private, 'family')[0][8] === '7', 'Conflict preserved saved change');
    try {
        bearsAppendRow($private, 'family', $family);
        throw new LogicException('Duplicate accepted');
    } catch (PDOException) {}
    checkStorage(count(bearsReadRows($private, 'family')) === 1, 'Duplicate rolled back');
    $row = bearsReadRows($private, 'family')[0];
    bearsUpdateRow($private, 'family', $row[0], hash('sha256', json_encode($row, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)), null);
    checkStorage(bearsReadRows($private, 'family') === [], 'Delete');
    $team = ['joueur', 'attente', '0', 'ABCDEF1234', 'Élodie Test', 'non', 'oui', 'non', 'oui', '', '42', '1', '0'];
    bearsSaveTeams($private, bearsRowsCsv('teams', [$team]));
    checkStorage(bearsReadRows($private, 'teams') === [$team], 'Team save');
    // Force an insert failure after DELETE to prove that team replacement rolls back.
    $badTeam = $team;
    $badTeam[4] = str_repeat('A', 70000); // Larger than a MySQL TEXT column.
    try {
        bearsSaveTeams($private, bearsRowsCsv('teams', [$badTeam]));
        throw new LogicException('Invalid SQL accepted');
    } catch (PDOException) {}
    checkStorage(bearsReadRows($private, 'teams') === [$team], 'Atomic team rollback');
    bearsCreateDailyBackup($private);
    $date = (new DateTimeImmutable('now', new DateTimeZone('Europe/Brussels')))->format('Y-m-d');
    $path = $private . '/backups/' . $date . '-mysql';
    $snapshot = json_decode(file_get_contents($path . '/mysql-data.json'), true, 512, JSON_THROW_ON_ERROR);
    checkStorage($snapshot['datasets']['camp'] === [$camp] && $snapshot['datasets']['teams'] === [$team], 'SQL backup contents');
    $manifest = json_decode(file_get_contents($path . '/manifest.json'), true, 512, JSON_THROW_ON_ERROR);
    checkStorage($manifest['files']['mysql-data.json'] === hash_file('sha256', $path . '/mysql-data.json'), 'SQL backup checksum');
    checkStorage(!file_exists($path . '/database-config.php'), 'No credential backup');
    return ['passed' => ['legacy_11_12_13', 'camp_8_9', 'utf8_quotes_multiline', 'invalid_import', 'sql_insert', 'duplicate_rollback', 'stale_update', 'delete', 'team_save', 'team_rollback', 'sql_backup']];
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    testStorageFormats();
    echo "CSV import format tests passed\n";
}
