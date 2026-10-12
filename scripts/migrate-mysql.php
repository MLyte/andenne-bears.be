<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/bears-migration.php';
$options = getopt('', ['private:', 'activate']);
if (!isset($options['private'])) {
    fwrite(STDERR, "Usage: php scripts/migrate-mysql.php --private=/private/directory [--activate]\n");
    exit(2);
}
try {
    echo json_encode(bearsMigrateMysql($options['private'], array_key_exists('activate', $options)), JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
} catch (Throwable $error) {
    // Operational status only; driver details and secrets are never printed.
    fwrite(STDERR, 'Migration refused: ' . get_class($error) . ' (' . $error->getCode() . "). Sources preserved.\n");
    exit(1);
}
