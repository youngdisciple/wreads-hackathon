<?php

declare(strict_types=1);

// Run with: php tests/upload-routes.php (no database needed for guest uploads).
ini_set('session.save_path', sys_get_temp_dir());
$_SERVER['SCRIPT_NAME'] = '/index.php';
$app = require __DIR__ . '/../config/bootstrap.php';
$factory = new Slim\Psr7\Factory\ServerRequestFactory();

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$paths = [];
try {
    $makeFile = function (string $name, string $content) use (&$paths): Slim\Psr7\UploadedFile {
        $path = tempnam(sys_get_temp_dir(), 'wreads-test-');
        $paths[] = $path;
        file_put_contents($path, $content);
        return new Slim\Psr7\UploadedFile($path, $name, 'text/plain', strlen($content));
    };
    $post = function (array $files) use ($app, $factory): array {
        $request = $factory->createServerRequest('POST', '/api/upload')
            ->withHeader('Accept', 'application/json')->withUploadedFiles(['files' => $files]);
        $response = $app->handle($request);
        return [$response->getStatusCode(), json_decode((string) $response->getBody(), true)];
    };

    [$status, $data] = $post([
        $makeFile('notes.txt', 'These study notes have enough words to extract and read.'),
        $makeFile('empty.txt', ''),
    ]);
    check($status === 201, 'A batch with one accepted file should return 201.');
    check($data['guest'] === true && $data['files'][0]['id'] === null, 'Guest uploads must not be saved to an account.');
    check(count($data['files'][0]['pages']) > 0, 'Uploaded text must be returned for the dashboard.');
    check(count($data['rejected']) === 1, 'Empty files should be reported separately.');

    [$status, $data] = $post([$makeFile('script.exe', 'Unsupported file contents.')]);
    check($status === 422 && count($data['rejected']) === 1, 'Unsupported files should be rejected.');
    [$status] = $post([]);
    check($status === 400, 'Missing files should return 400.');
    echo "Guest upload, extracted text, partial success, rejection, and missing-file checks passed.\n";
} finally {
    foreach ($paths as $path) {
        if (is_file($path)) unlink($path);
    }
}
