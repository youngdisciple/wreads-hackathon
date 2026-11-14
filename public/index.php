<?php

declare(strict_types=1);

//* This is the entry point of the application: the front controller of the Slim application.

// PHP's built-in server (`composer start`) sends every request here, so static
// files under public/ have to be served by hand. Apache does this by itself.
if (PHP_SAPI === 'cli-server') {
    $path = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    $base = '/' . ($_ENV['APP_ROOT_DIR'] ?? basename(dirname(__DIR__)));
    if ($base !== '/' && str_starts_with($path, $base . '/')) {
        $path = substr($path, strlen($base));
    }
    $file = realpath(__DIR__ . $path);
    if (
        $file !== false
        && is_file($file)
        && str_starts_with($file, __DIR__ . DIRECTORY_SEPARATOR)
        && strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'php'
        && !str_starts_with(basename($file), '.')
    ) {
        $types = [
            'css' => 'text/css; charset=utf-8',
            'js' => 'text/javascript; charset=utf-8',
            'mjs' => 'text/javascript; charset=utf-8',
            'json' => 'application/json',
            'svg' => 'image/svg+xml',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'ico' => 'image/x-icon',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'txt' => 'text/plain; charset=utf-8',
        ];
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
        header('Content-Length: ' . filesize($file));
        readfile($file);
        return;
    }
}

// Launch the application's bootstrap process.
(require_once __DIR__ . '/../config/bootstrap.php')->run();
