<?php

declare(strict_types=1);

use App\Domain\Models\UploadModel;
use App\Helpers\Core\AppSettings;
use App\Helpers\Core\PDOService;

ini_set('session.save_path', sys_get_temp_dir());
$_SERVER['SCRIPT_NAME'] = '/index.php';
$app = require __DIR__ . '/../config/bootstrap.php';
$container = $app->getContainer();
$factory = new Slim\Psr7\Factory\ServerRequestFactory();

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$settings = (array) $container->get(AppSettings::class)->get();
$settings['anthropic']['allow_guests'] = false;
$container->set(AppSettings::class, new AppSettings($settings));

$pdo = $container->get(PDOService::class)->getPDO();
$dir = __DIR__ . '/../public/summarized';
$tag = bin2hex(random_bytes(4));
$sampleKey = 'test-sample-' . $tag;
$uploadKey = UploadModel::newId();
$notes = "Cells are the smallest unit of life.\n\nMitochondria make ATP for the cell.";
$files = [];
$userId = 0;

$call = function (string $method, string $path, ?array $body = null) use ($app, $factory): array {
    $request = $factory->createServerRequest($method, $path)->withHeader('Accept', 'application/json');
    if ($body !== null) {
        $request = $request->withParsedBody($body);
    }
    $response = $app->handle($request);
    return [$response->getStatusCode(), json_decode((string) $response->getBody(), true)];
};
$row = function (string $key) use ($pdo, &$userId): array|false {
    $stmt = $pdo->prepare('SELECT * FROM summaries WHERE file_key = ? AND user_id = ?');
    $stmt->execute([$key, $userId]);
    return $stmt->fetch();
};

try {
    session_start();
    $_SESSION = [];

    [$status] = $call('POST', '/api/summarize', ['id' => $sampleKey, 'text' => 'Some text.']);
    check($status === 401, 'Guests must not be able to summarize.');
    [$status] = $call('GET', '/api/summarize/' . $sampleKey);
    check($status === 401, 'Guests must not be able to read summaries.');

    $pdo->prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
        ->execute(['test_' . $tag, "test_$tag@example.invalid", password_hash($tag, PASSWORD_DEFAULT)]);
    $userId = (int) $pdo->lastInsertId();
    $_SESSION['user'] = ['id' => $userId, 'username' => 'test_' . $tag, 'email' => "test_$tag@example.invalid"];

    [$status] = $call('GET', '/api/summarize/' . $sampleKey);
    check($status === 404, 'A file with no summary should return 404.');
    [$status] = $call('POST', '/api/summarize', ['id' => '', 'text' => 'Some text.']);
    check($status === 400, 'A missing file id should return 400.');

    foreach ([$sampleKey, $uploadKey] as $key) {
        $files[] = "$dir/$key.txt";
        file_put_contents("$dir/$key.txt", $notes . "\n");
    }
    [$status, $data] = $call('POST', '/api/summarize', ['id' => $sampleKey, 'name' => 'Cells.txt', 'text' => 'Some text.']);
    check($status === 200 && $data['cached'] === true && $data['summary'] === $notes, 'Saved notes should be returned without a new summary.');
    $saved = $row($sampleKey);
    check($saved && $saved['content'] === $notes, 'The summary should be stored in the summaries table.');
    check($saved['original_name'] === 'Cells.txt' && (int) $saved['word_count'] === 13, 'The row should keep the file name and word count.');
    check($saved['upload_id'] === null, 'A summary of a sample file has no upload to link to.');

    unlink("$dir/$sampleKey.txt");
    [$status, $data] = $call('GET', '/api/summarize/' . $sampleKey);
    check($status === 200 && $data['summary'] === $notes, 'A saved summary should be read back from the table.');
    [$status] = $call('POST', '/api/summarize', ['id' => $sampleKey, 'name' => 'Cells.txt', 'text' => 'Some text.']);
    $count = $pdo->prepare('SELECT COUNT(*) FROM summaries WHERE user_id = ?');
    $count->execute([$userId]);
    check($status === 200 && (int) $count->fetchColumn() === 1, 'Asking again must not create a second row.');

    $files[] = __DIR__ . "/../var/uploads/$uploadKey.pdf";
    file_put_contents(end($files), 'pdf');
    $container->get(UploadModel::class)->create([
        'id' => $uploadKey, 'user_id' => $userId, 'original_name' => 'notes.pdf', 'file_name' => "$uploadKey.pdf",
        'size_bytes' => 10, 'content' => 'Some text.', 'page_count' => 1, 'word_count' => 2,
    ]);
    [$status] = $call('GET', '/api/summarize/' . $uploadKey);
    $saved = $row($uploadKey);
    check($status === 200 && $saved && $saved['upload_id'] === $uploadKey, 'A summary of an upload should point at that upload.');
    check($saved['original_name'] === 'notes.pdf', 'A summary copied in from a file should take the upload\'s name.');
    [$status] = $call('DELETE', '/api/uploads/' . $uploadKey);
    check($status === 200, 'Deleting the upload should succeed.');
    check($row($uploadKey) === false, 'Deleting an upload should delete its summary row.');
    check(!is_file("$dir/$uploadKey.txt"), 'Deleting an upload should delete its summary file.');

    $_SESSION['user']['id'] = $userId + 1000000;
    [$status] = $call('GET', '/api/summarize/' . $sampleKey);
    check($status === 404, 'One user must not get another user\'s summary.');

    echo "Guest lock-out, saving to the summaries table, reading back, no duplicates, upload link, cascade delete and per-user checks passed.\n";
} finally {
    if ($userId) {
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
    }
    foreach ($files as $file) {
        if (is_file($file)) {
            unlink($file);
        }
    }
    $_SESSION = [];
}
