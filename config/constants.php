<?php

declare(strict_types=1);

// Define the path of the application's root directory.
define('APP_BASE_DIR_PATH', dirname(__DIR__, 1));

// Detect the URL subdirectory from the front controller, including Apache's
// rewrite from /wreads/ to /wreads/public/index.php.
$scriptDirectory = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
$detectedBasePath = preg_replace('~/public$~', '', $scriptDirectory);
if ($detectedBasePath === '.') {
    $detectedBasePath = '';
}

// An explicit setting (including an empty string) overrides detection.
// Read getenv() as well because PHP may not populate $_ENV.
define('APP_ROOT_DIR_NAME', trim(
    (string) ($_ENV['APP_ROOT_DIR'] ?? $_SERVER['APP_ROOT_DIR'] ?? (getenv('APP_ROOT_DIR') !== false ? getenv('APP_ROOT_DIR') : $detectedBasePath)),
    '/'
));
unset($scriptDirectory, $detectedBasePath);

// Define the path of the application's views directory.
const APP_VIEWS_PATH = APP_BASE_DIR_PATH . '/app/Views';



//* HTTP response status code.
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_NOT_FOUND = 404;
//* HTTP response headers.
const HEADERS_CONTENT_TYPE = "Content-Type";
//* Supported Media Types.
const APP_MEDIA_TYPE_JSON = "application/json";
const APP_MEDIA_TYPE_XML = "application/xml";
const APP_MEDIA_TYPE_YAML = "application/yaml";
