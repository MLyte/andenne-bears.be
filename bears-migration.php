<?php
declare(strict_types=1);

require_once __DIR__ . '/bears-storage.php';

/** Called only by the CLI or a short-lived authenticated maintenance runner. */
function bearsCreateSchema(PDO $pdo, bool $temporary = false): void
{
    $create = $temporary ? 'CREATE TEMPORARY TABLE ' : 'CREATE TABLE IF NOT EXISTS ';
    foreach (['family', 'camp', 'teams'] as $dataset) {
        $definition = bearsDataset($dataset);
        $columns = ['row_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY'];
        foreach ($definition['header'] as $column) {
            $columns[] = '`' . $column . '` ' . match ($column) {
                'reference' => 'VARCHAR(32) COLLATE utf8mb4_bin NOT NULL UNIQUE',
                'paye' => "VARCHAR(3) NOT NULL DEFAULT 'non'",
                'nuits' => "VARCHAR(12) NOT NULL DEFAULT 'a_preciser'",
                'taille_tshirt' => "VARCHAR(3) NOT NULL DEFAULT ''",
                default => 'TEXT NOT NULL',
            };
        }
        $pdo->exec($create . '`' . $definition['table'] . '` (' . implode(',', $columns) . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
    }
    $pdo->exec($create . 'bears_dataset_state (dataset VARCHAR(16) PRIMARY KEY, present TINYINT NOT NULL, source_sha256 CHAR(64) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
    bearsEnsureCampPaymentColumn($pdo);
    if ($temporary) return;
    foreach (['bears_family_registrations', 'bears_camp_registrations', 'bears_team_players', 'bears_dataset_state'] as $table) {
        $query = $pdo->prepare('SELECT ENGINE FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
        $query->execute([$table]);
        if ($query->fetchColumn() !== 'InnoDB') throw new RuntimeException('Transactional schema required.');
    }
}

function bearsMigrateMysql(string $private, bool $activate = false): array
{
    $private = bearsStorageRoot($private);
    $lockPath = $private . '/.mysql-migration.lock';
    if (is_link($lockPath)) throw new RuntimeException('Invalid migration lock.');
    $lock = fopen($lockPath, 'c+');
    if ($lock === false) throw new RuntimeException('Migration lock unavailable.');
    $sourceLocks = [];
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Migration lock unavailable.');
        if (file_exists($private . '/.mysql-active') || is_link($private . '/.mysql-active')) {
            if (is_link($private . '/.mysql-active') || file_get_contents($private . '/.mysql-active') !== "bears-mysql-v1\n") throw new RuntimeException('Invalid activation marker.');
            return ['active' => true, 'already_active' => true];
        }
        $pdo = bearsDatabase($private);
        $sources = $rows = $counts = [];
        foreach (['family', 'camp', 'teams'] as $dataset) {
            $path = $private . '/' . bearsDataset($dataset)['file'];
            if (is_link($path)) throw new RuntimeException('Linked source refused.');
            if (!file_exists($path)) {
                $sources[$dataset] = null;
                $rows[$dataset] = [];
            } else {
                $stream = fopen($path, 'rb');
                if ($stream === false || !flock($stream, LOCK_EX)) throw new RuntimeException('Source lock unavailable.');
                $sourceLocks[] = $stream;
                $sources[$dataset] = stream_get_contents($stream);
                if ($sources[$dataset] === false) throw new RuntimeException('Source read failed.');
                $rows[$dataset] = bearsParseCsv($dataset, $sources[$dataset]);
            }
            $counts[$dataset] = count($rows[$dataset]);
        }
        if (!$activate) return ['active' => false, 'dry_run' => true, 'rows' => $counts];

        // The source copy is independent of the daily backup and contains no credentials.
        $backupParent = $private . '/migration-backups';
        if (is_link($backupParent) || (!is_dir($backupParent) && !mkdir($backupParent, 0700))) throw new RuntimeException('Backup unavailable.');
        $backup = $backupParent . '/' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(4));
        if (!mkdir($backup, 0700)) throw new RuntimeException('Backup unavailable.');
        $manifest = ['created_at' => gmdate('c'), 'files' => []];
        foreach ($sources as $dataset => $source) {
            if ($source === null) continue;
            $name = bearsDataset($dataset)['file'];
            if (file_put_contents($backup . '/' . $name, $source, LOCK_EX) !== strlen($source)) throw new RuntimeException('Backup write failed.');
            chmod($backup . '/' . $name, 0600);
            $manifest['files'][$name] = hash('sha256', $source);
            if (hash_file('sha256', $backup . '/' . $name) !== $manifest['files'][$name]) throw new RuntimeException('Backup verification failed.');
        }
        $manifestJson = json_encode($manifest, JSON_THROW_ON_ERROR);
        if (file_put_contents($backup . '/manifest.json', $manifestJson, LOCK_EX) !== strlen($manifestJson)) throw new RuntimeException('Backup manifest failed.');
        chmod($backup . '/manifest.json', 0600);

        bearsCreateSchema($pdo);
        $pdo->beginTransaction();
        try {
            $existing = $pdo->query('SELECT dataset, present, source_sha256 FROM bears_dataset_state FOR UPDATE')->fetchAll(PDO::FETCH_ASSOC);
            if ($existing) {
                // Retry only if a prior committed import matches every current source and row.
                if (count($existing) !== 3) throw new RuntimeException('Incomplete previous import.');
                foreach ($existing as $entry) {
                    $dataset = $entry['dataset'];
                    if (!array_key_exists($dataset, $sources) || (int) $entry['present'] !== (int) ($sources[$dataset] !== null)
                        || $entry['source_sha256'] !== hash('sha256', $sources[$dataset] ?? '') || bearsSqlRows($pdo, $dataset) !== $rows[$dataset]) {
                        throw new RuntimeException('Existing database differs from the sources. No overwrite performed.');
                    }
                }
            } else {
                foreach (['family', 'camp', 'teams'] as $dataset) {
                    if (bearsSqlRows($pdo, $dataset)) throw new RuntimeException('Destination is not empty. No overwrite performed.');
                    foreach ($rows[$dataset] as $row) bearsSqlInsert($pdo, $dataset, $row);
                    $pdo->prepare('INSERT INTO bears_dataset_state (dataset, present, source_sha256) VALUES (?, ?, ?)')->execute([$dataset, (int) ($sources[$dataset] !== null), hash('sha256', $sources[$dataset] ?? '')]);
                    if (bearsSqlRows($pdo, $dataset) !== $rows[$dataset]) throw new RuntimeException('Imported data verification failed.');
                }
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        $pending = $private . '/.mysql-active-' . bin2hex(random_bytes(8));
        $marker = "bears-mysql-v1\n";
        if (file_put_contents($pending, $marker, LOCK_EX) !== strlen($marker)) throw new RuntimeException('Activation marker unavailable.');
        chmod($pending, 0600);
        if (!rename($pending, $private . '/.mysql-active')) {
            unlink($pending);
            throw new RuntimeException('Activation failed; verified import can be retried.');
        }
        return ['active' => true, 'rows' => $counts, 'verified' => true, 'backup' => basename($backup)];
    } finally {
        foreach ($sourceLocks as $stream) { flock($stream, LOCK_UN); fclose($stream); }
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
