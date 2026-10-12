<?php
declare(strict_types=1);

/** Storage shared by the registration forms, dashboards and team draw. */
function bearsDataset(string $dataset): array
{
    return match ($dataset) {
        'family' => ['file' => 'family-day-2026.csv', 'table' => 'bears_family_registrations', 'header' => ['reference', 'date_utc', 'nom', 'email_contact', 'mineur', 'responsable_legal', 'flag', 'match', 'repas', 'joueur_bears', 'femme', 'benevole_wallos_declare', 'aide_organisation_declaree'], 'legacy' => [11, 12]],
        'camp' => ['file' => 'camp-blegny-2026.csv', 'table' => 'bears_camp_registrations', 'header' => ['reference', 'date_utc', 'nom', 'prenom', 'categorie', 'exigence_alimentaire', 'allergies', 'autres', 'logement'], 'legacy' => [8]],
        'teams' => ['file' => 'family-teams-2026.csv', 'table' => 'bears_team_players', 'header' => ['type', 'equipe', 'ordre', 'reference', 'nom', 'bears', 'femme', 'mineur', 'present', 'proche_reference', 'tirage', 'nombre_equipes', 'revision'], 'legacy' => []],
        default => throw new InvalidArgumentException('Unknown dataset.'),
    };
}

function bearsStorageRoot(string $private): string
{
    $root = realpath($private);
    $web = realpath(__DIR__);
    if ($root === false || $web === false || !is_dir($root)
        || str_starts_with($root . DIRECTORY_SEPARATOR, $web . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Stockage privé indisponible.', 503);
    }
    return $root;
}

/** Keep a shared cutover lock until the request ends, including legacy writes. */
function bearsStorageMode(string $private): bool
{
    static $locks = [];
    $private = bearsStorageRoot($private);
    if (!isset($locks[$private])) {
        $path = $private . '/.mysql-migration.lock';
        if (is_link($path)) throw new RuntimeException('Stockage privé indisponible.', 503);
        $lock = @fopen($path, 'c+');
        if ($lock === false || !flock($lock, LOCK_SH)) throw new RuntimeException('Stockage privé indisponible.', 503);
        $locks[$private] = $lock;
    }
    clearstatcache(true, $private . '/.mysql-active');
    if (is_link($private . '/.mysql-active')) throw new RuntimeException('Stockage privé indisponible.', 503);
    if (!file_exists($private . '/.mysql-active')) return false;
    if (file_get_contents($private . '/.mysql-active') !== "bears-mysql-v1\n") {
        throw new RuntimeException('Configuration du stockage invalide.', 503);
    }
    return true;
}

function bearsDatabase(string $private): PDO
{
    static $connections = [];
    $private = bearsStorageRoot($private);
    if (isset($connections[$private])) return $connections[$private];
    $path = $private . '/database-config.php';
    if (is_link($path) || !is_file($path)) throw new RuntimeException('Configuration MySQL indisponible.', 503);
    $config = require $path;
    foreach (['host', 'database', 'username', 'password'] as $key) {
        if (!is_array($config) || !is_string($config[$key] ?? null) || $config[$key] === '') {
            throw new RuntimeException('Configuration MySQL incomplète.', 503);
        }
    }
    if (!preg_match('/^[a-zA-Z0-9.-]+$/D', $config['host']) || !preg_match('/^[a-zA-Z0-9_]+$/D', $config['database'])
        || !is_int($config['port'] ?? 3306) || ($config['port'] ?? 3306) < 1 || ($config['port'] ?? 3306) > 65535) {
        throw new RuntimeException('Configuration MySQL invalide.', 503);
    }
    try {
        $pdo = new PDO('mysql:host=' . $config['host'] . ';port=' . ($config['port'] ?? 3306) . ';dbname=' . $config['database'] . ';charset=utf8mb4', $config['username'], $config['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_NUM,
            PDO::ATTR_STRINGIFY_FETCHES => true,
            PDO::ATTR_TIMEOUT => 10,
        ]);
        $pdo->exec("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
        return $connections[$private] = $pdo;
    } catch (PDOException) {
        // Never expose a driver exception, DSN, password or stack trace to visitors.
        throw new RuntimeException('Base de données temporairement indisponible.', 503);
    }
}

function bearsStorageWeb(callable $operation): mixed
{
    try {
        return $operation();
    } catch (Throwable $error) {
        $code = in_array($error->getCode(), [404, 409, 503], true) ? (int) $error->getCode() : 503;
        $message = match ($code) {
            404 => 'Inscription introuvable. Recharge la page.',
            409 => 'Ces données ont changé entre-temps. Recharge la page avant de les modifier.',
            default => 'Stockage temporairement indisponible. Réessaie plus tard.',
        };
        error_log('Bears storage failure: ' . get_class($error) . ' (' . $code . ')');
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'message' => $message, 'error' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function bearsValidateRows(string $dataset, array $rows): void
{
    $definition = bearsDataset($dataset);
    $seen = [];
    foreach ($rows as $row) {
        if (!array_is_list($row) || count($row) !== count($definition['header'])) throw new RuntimeException('Format invalide.', 503);
        foreach ($row as $value) {
            if (!is_string($value) || !preg_match('//u', $value)) throw new RuntimeException('Encodage invalide.', 503);
        }
        $reference = $row[$dataset === 'teams' ? 3 : 0];
        $pattern = $dataset === 'teams' ? '/^(?:[A-F0-9]{10}|sur-place-[1-9][0-9]*)$/D' : '/^[A-F0-9]{10}$/D';
        if (!preg_match($pattern, $reference) || isset($seen[$reference])) throw new RuntimeException('Référence invalide ou dupliquée.', 503);
        $seen[$reference] = true;
        if ($dataset === 'family') {
            if (!in_array($row[6], ['oui', 'non'], true) || !preg_match('/^(?:oui|non|[0-9]|[1-4][0-9]|50)$/D', $row[8])) throw new RuntimeException('Participation invalide.', 503);
            foreach ([4, 9, 10, 11, 12] as $index) {
                if (!in_array($row[$index], ['', 'oui', 'non'], true)) throw new RuntimeException('Participation invalide.', 503);
            }
        } elseif ($dataset === 'camp') {
            if (!in_array($row[4], ['Junior', 'Senior', 'Staff'], true) || !in_array($row[8], ['oui', 'non'], true)) throw new RuntimeException('Participation invalide.', 503);
        } else {
            if ($row[0] !== 'joueur') throw new RuntimeException('Tirage invalide.', 503);
            foreach ([5, 6, 7, 8] as $index) if (!in_array($row[$index], ['oui', 'non'], true)) throw new RuntimeException('Tirage invalide.', 503);
            foreach ([2, 10, 11, 12] as $index) if (!ctype_digit($row[$index])) throw new RuntimeException('Tirage invalide.', 503);
        }
    }
}

function bearsParseCsv(string $dataset, string $csv): array
{
    $definition = bearsDataset($dataset);
    $stream = fopen('php://temp', 'w+');
    try {
        fwrite($stream, $csv);
        rewind($stream);
        $header = fgetcsv($stream, 0, ';', '"', '\\');
        if (!is_array($header)) throw new RuntimeException('En-tête absent.', 503);
        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
        $width = count($header);
        if ($header !== $definition['header'] && (!in_array($width, $definition['legacy'], true) || $header !== array_slice($definition['header'], 0, $width))) {
            throw new RuntimeException('En-tête invalide.', 503);
        }
        $rows = [];
        while (($row = fgetcsv($stream, 0, ';', '"', '\\')) !== false) {
            if (count($row) !== $width) throw new RuntimeException('Ligne incomplète.', 503);
            while (count($row) < count($definition['header'])) $row[] = $dataset === 'camp' ? 'oui' : '';
            $rows[] = $row;
        }
        bearsValidateRows($dataset, $rows);
        return $rows;
    } finally {
        fclose($stream);
    }
}

function bearsRowsCsv(string $dataset, array $rows): string
{
    $stream = fopen('php://temp', 'w+');
    try {
        fputcsv($stream, bearsDataset($dataset)['header'], ';', '"', '\\');
        foreach ($rows as $row) fputcsv($stream, $row, ';', '"', '\\');
        rewind($stream);
        return stream_get_contents($stream);
    } finally {
        fclose($stream);
    }
}

/** Compatibility stream for existing dashboard rendering and CSV downloads. */
function bearsReadStream(string $private, string $dataset)
{
    $rows = bearsReadRows($private, $dataset);
    $stream = fopen('php://temp', 'w+');
    fwrite($stream, bearsRowsCsv($dataset, $rows ?? []));
    rewind($stream);
    return $stream;
}

function bearsSqlRows(PDO $pdo, string $dataset): array
{
    $definition = bearsDataset($dataset);
    $columns = '`' . implode('`,`', $definition['header']) . '`';
    return $pdo->query('SELECT ' . $columns . ' FROM `' . $definition['table'] . '` ORDER BY row_id')->fetchAll(PDO::FETCH_NUM);
}

function bearsReadRows(string $private, string $dataset): ?array
{
    $definition = bearsDataset($dataset);
    if (bearsStorageMode($private)) {
        $pdo = bearsDatabase($private);
        $statement = $pdo->prepare('SELECT present FROM bears_dataset_state WHERE dataset = ?');
        $statement->execute([$dataset]);
        $present = $statement->fetchColumn();
        if ($present === false) throw new RuntimeException('Migration incomplète.', 503);
        return (int) $present === 0 ? null : bearsSqlRows($pdo, $dataset);
    }
    $path = $private . '/' . $definition['file'];
    if (is_link($path)) throw new RuntimeException('Stockage privé invalide.', 503);
    if (!file_exists($path)) return null;
    $stream = @fopen($path, 'rb');
    if ($stream === false) throw new RuntimeException('Lecture indisponible.', 503);
    try {
        if (!flock($stream, LOCK_SH)) throw new RuntimeException('Lecture indisponible.', 503);
        $csv = stream_get_contents($stream);
        if ($csv === false) throw new RuntimeException('Lecture indisponible.', 503);
        return bearsParseCsv($dataset, $csv);
    } finally {
        flock($stream, LOCK_UN);
        fclose($stream);
    }
}

function bearsSqlInsert(PDO $pdo, string $dataset, array $row): void
{
    $definition = bearsDataset($dataset);
    $columns = '`' . implode('`,`', $definition['header']) . '`';
    $statement = $pdo->prepare('INSERT INTO `' . $definition['table'] . '` (' . $columns . ') VALUES (' . implode(',', array_fill(0, count($row), '?')) . ')');
    $statement->execute($row);
}

function bearsAppendRow(string $private, string $dataset, array $row): void
{
    bearsValidateRows($dataset, [$row]);
    if (!bearsStorageMode($private)) throw new LogicException('SQL storage is not active.');
    $pdo = bearsDatabase($private);
    $pdo->beginTransaction();
    try {
        bearsSqlInsert($pdo, $dataset, $row);
        $pdo->prepare('UPDATE bears_dataset_state SET present = 1 WHERE dataset = ?')->execute([$dataset]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function bearsUpdateRow(string $private, string $dataset, string $reference, string $version, ?array $changes): void
{
    $definition = bearsDataset($dataset);
    $pdo = bearsDatabase($private);
    $pdo->beginTransaction();
    try {
        $columns = '`' . implode('`,`', $definition['header']) . '`';
        $statement = $pdo->prepare('SELECT ' . $columns . ' FROM `' . $definition['table'] . '` WHERE reference = ? FOR UPDATE');
        $statement->execute([$reference]);
        $row = $statement->fetch(PDO::FETCH_NUM);
        if ($row === false) throw new RuntimeException('Inscription introuvable.', 404);
        if (!hash_equals(hash('sha256', json_encode($row, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)), $version)) {
            throw new RuntimeException('Modification concurrente.', 409);
        }
        if ($changes === null) {
            $pdo->prepare('DELETE FROM `' . $definition['table'] . '` WHERE reference = ?')->execute([$reference]);
        } else {
            foreach ($changes as $index => $value) {
                if (!is_int($index) || $index < 1 || $index >= count($row)) throw new InvalidArgumentException('Invalid field.');
                $row[$index] = $value;
            }
            bearsValidateRows($dataset, [$row]);
            $set = implode(',', array_map(static fn ($name) => '`' . $name . '` = ?', array_slice($definition['header'], 1)));
            $pdo->prepare('UPDATE `' . $definition['table'] . '` SET ' . $set . ' WHERE reference = ?')->execute([...array_slice($row, 1), $reference]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

/** Caller holds the existing team lock across read, version check and replacement. */
function bearsSaveTeams(string $private, string $csv): void
{
    $rows = bearsParseCsv('teams', $csv);
    $pdo = bearsDatabase($private);
    $pdo->beginTransaction();
    try {
        $pdo->exec('DELETE FROM bears_team_players');
        foreach ($rows as $row) bearsSqlInsert($pdo, 'teams', $row);
        $pdo->exec("UPDATE bears_dataset_state SET present = 1 WHERE dataset = 'teams'");
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
