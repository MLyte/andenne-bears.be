<?php
declare(strict_types=1);

/** Create one private snapshot on the first successful write of each local day. */
function bearsBackupAfterWrite(string $private): void
{
    try {
        bearsCreateDailyBackup($private);
    } catch (Throwable $error) {
        // A completed registration must not be reported as failed because its backup failed.
        error_log('Andenne Bears private backup failed: ' . $error->getMessage());
    }
}

function bearsCreateDailyBackup(string $private): void
{
    $root = realpath($private);
    $web = realpath(__DIR__);
    if ($root === false || $web === false || !is_writable($root)
        || str_starts_with($root . DIRECTORY_SEPARATOR, $web . DIRECTORY_SEPARATOR)) {
        throw new RuntimeException('Invalid private storage.');
    }
    $backupRoot = $root . DIRECTORY_SEPARATOR . 'backups';
    if (is_link($backupRoot) || (!is_dir($backupRoot) && !@mkdir($backupRoot, 0700))) {
        throw new RuntimeException('Backup directory unavailable.');
    }
    @chmod($backupRoot, 0700);
    $lockPath = $backupRoot . DIRECTORY_SEPARATOR . '.backup.lock';
    if (is_link($lockPath)) throw new RuntimeException('Backup lock unavailable.');
    $lock = @fopen($lockPath, 'c+');
    if ($lock === false) throw new RuntimeException('Backup lock unavailable.');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Backup lock unavailable.');
        $today = (new DateTimeImmutable('now', new DateTimeZone('Europe/Brussels')))->format('Y-m-d');
        $target = $backupRoot . DIRECTORY_SEPARATOR . $today;
        if (is_dir($target) && is_file($target . DIRECTORY_SEPARATOR . 'manifest.json')) return;
        if (file_exists($target) || is_link($target)) throw new RuntimeException('Incomplete backup exists.');
        $pending = $backupRoot . DIRECTORY_SEPARATOR . '.pending-' . bin2hex(random_bytes(8));
        if (!mkdir($pending, 0700)) throw new RuntimeException('Backup staging unavailable.');
        try {
            $manifest = ['created_at' => gmdate('c'), 'files' => []];
            foreach (['family-day-2026.csv', 'camp-blegny-2026.csv', 'family-teams-2026.csv', 'members-depth-chart.json'] as $name) {
                $source = $root . DIRECTORY_SEPARATOR . $name;
                if (!file_exists($source) && !is_link($source)) continue;
                bearsBackupCopy($source, $pending . DIRECTORY_SEPARATOR . $name);
                $manifest['files'][$name] = hash_file('sha256', $pending . DIRECTORY_SEPARATOR . $name);
            }
            $photos = $root . DIRECTORY_SEPARATOR . 'member-photos';
            if (is_link($photos)) throw new RuntimeException('Photo directory is a link.');
            if (is_dir($photos)) {
                $photoBackup = $pending . DIRECTORY_SEPARATOR . 'member-photos';
                if (!mkdir($photoBackup, 0700)) throw new RuntimeException('Photo backup unavailable.');
                foreach (new DirectoryIterator($photos) as $entry) {
                    if ($entry->isDot()) continue;
                    $name = $entry->getFilename();
                    if (!preg_match('/^[a-f0-9]{24}\.(jpg|png|webp)$/', $name) || !$entry->isFile() || $entry->isLink()) {
                        throw new RuntimeException('Unexpected photo entry.');
                    }
                    bearsBackupCopy($entry->getPathname(), $photoBackup . DIRECTORY_SEPARATOR . $name);
                    $manifest['files']['member-photos/' . $name] = hash_file('sha256', $photoBackup . DIRECTORY_SEPARATOR . $name);
                }
            }
            if (!$manifest['files']) throw new RuntimeException('No private data to back up.');
            $encoded = json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            if (file_put_contents($pending . DIRECTORY_SEPARATOR . 'manifest.json', $encoded, LOCK_EX) !== strlen($encoded)) {
                throw new RuntimeException('Backup manifest unavailable.');
            }
            @chmod($pending . DIRECTORY_SEPARATOR . 'manifest.json', 0600);
            if (!rename($pending, $target)) throw new RuntimeException('Backup publication failed.');
        } finally {
            if (is_dir($pending)) bearsBackupRemoveDirectory($pending);
        }
        bearsBackupPrune($backupRoot, $today);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function bearsBackupCopy(string $source, string $target): void
{
    if (is_link($source) || !is_file($source)) throw new RuntimeException('Backup source unavailable.');
    $input = @fopen($source, 'rb');
    $output = @fopen($target, 'xb');
    if ($input === false || $output === false) {
        if (is_resource($input)) fclose($input);
        if (is_resource($output)) fclose($output);
        throw new RuntimeException('Backup copy unavailable.');
    }
    try {
        if (!flock($input, LOCK_SH) || stream_copy_to_stream($input, $output) === false || !fflush($output)) {
            throw new RuntimeException('Backup copy failed.');
        }
        @chmod($target, 0600);
    } finally {
        flock($input, LOCK_UN);
        fclose($input);
        fclose($output);
    }
}

function bearsBackupPrune(string $backupRoot, string $today): void
{
    $cutoff = (new DateTimeImmutable($today))->modify('-14 days')->format('Y-m-d');
    foreach (new DirectoryIterator($backupRoot) as $entry) {
        if ($entry->isDot() || $entry->isLink() || !$entry->isDir()) continue;
        $name = $entry->getFilename();
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $name) && $name < $cutoff) {
            bearsBackupRemoveDirectory($entry->getPathname());
        }
    }
}

function bearsBackupRemoveDirectory(string $path): void
{
    if (is_link($path) || !is_dir($path)) return;
    foreach (new DirectoryIterator($path) as $entry) {
        if ($entry->isDot()) continue;
        if ($entry->isDir() && !$entry->isLink()) bearsBackupRemoveDirectory($entry->getPathname());
        else @unlink($entry->getPathname());
    }
    @rmdir($path);
}
