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

    // Build a real PDF with selectable text to exercise the installed parser.
    $text = 'These PDF study notes contain selectable text for reading.';
    $stream = "BT /F1 12 Tf 72 720 Td ($text) Tj ET";
    $objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Length ' . strlen($stream) . ">>\nstream\n$stream\nendstream",
    ];
    $pdf = "%PDF-1.4\n";
    $offsets = [];
    foreach ($objects as $index => $object) {
        $offsets[] = strlen($pdf);
        $pdf .= ($index + 1) . " 0 obj\n$object\nendobj\n";
    }
    $xrefOffset = strlen($pdf);
    $pdf .= "xref\n0 6\n0000000000 65535 f \n";
    foreach ($offsets as $offset) {
        $pdf .= sprintf("%010d 00000 n \n", $offset);
    }
    $pdf .= "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n$xrefOffset\n%%EOF\n";
    [$status, $data] = $post([$makeFile('notes.pdf', $pdf)]);
    check($status === 201, 'A PDF with selectable text should upload successfully.');
    check(str_contains(implode(' ', $data['files'][0]['pages']), $text), 'The PDF parser should return the actual document text.');

    // A PDF that parses but has no text (a scan) is reported as having no text.
    $blank = str_replace($stream, str_repeat(' ', strlen($stream)), $pdf);
    [$status, $data] = $post([$makeFile('scan.pdf', $blank)]);
    check($status === 422 && count($data['rejected']) === 1, 'A PDF without text should be rejected.');
    check(str_contains($data['rejected'][0]['reason'], 'No text found'), 'A PDF without text should say that no text was found.');

    // A file the parser can't open must not be blamed on scanning.
    [$status, $data] = $post([$makeFile('broken.pdf', 'This is not really a PDF file at all.')]);
    check($status === 422 && count($data['rejected']) === 1, 'An unreadable PDF should be rejected, not crash the request.');
    check(str_contains($data['rejected'][0]['reason'], 'could not be read'), 'An unreadable PDF should say it could not be read.');
    check(!str_contains($data['rejected'][0]['reason'], 'scanned'), 'An unreadable PDF must not be described as scanned.');

    [$status, $data] = $post([$makeFile('script.exe', 'Unsupported file contents.')]);
    check($status === 422 && count($data['rejected']) === 1, 'Unsupported files should be rejected.');
    [$status] = $post([]);
    check($status === 400, 'Missing files should return 400.');
    echo "Guest upload, PDF extraction, unreadable-PDF reporting, partial success, rejection, and missing-file checks passed.\n";
} finally {
    foreach ($paths as $path) {
        if (is_file($path)) unlink($path);
    }
}
