<?php

declare(strict_types=1);

return [
    // Keep closed until the event details and safeguarding arrangements are approved.
    'registration_open' => false,
    // A directory outside the public web root, writable by PHP.
    'storage_dir' => dirname(__DIR__, 2) . '/bears-family-day-private',
    'export_username' => 'organisateur',
    // Generate with: php -r "echo password_hash('a-long-random-password', PASSWORD_DEFAULT), PHP_EOL;"
    'export_password_hash' => '',
];
