<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Core\PDOService;
use DI\Container;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\UploadedFileInterface;

/**
 * POST /api/upload  (multipart/form-data, field name "files[]")
 *
 * Works for guests and logged-in users. Files are stored under var/uploads/,
 * one folder per user (or per guest session). Turning the files into
 * type-along / mad-libs sessions is the next step to build.
 */
class UploadController extends BaseController
{
    private const MAX_BYTES = 20 * 1024 * 1024; // 20 MB per file
    private const ALLOWED = ['pdf', 'docx', 'txt', 'md'];

    public function __construct(Container $container)
    {
        parent::__construct($container);
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }

    public function store(Request $request, Response $response, array $args): Response
    {
        $files = $request->getUploadedFiles()['files'] ?? [];
        if ($files instanceof UploadedFileInterface) {
            $files = [$files];
        }
        if (!$files) {
            return $this->json($response, ['error' => 'No files received.'], 400);
        }

        $user = $_SESSION['user'] ?? null;
        $owner = $user ? 'user-' . $user['id'] : 'guest-' . session_id();
        $dir = APP_BASE_DIR_PATH . '/var/uploads/' . $owner;
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
            return $this->json($response, ['error' => 'Could not create the upload folder.'], 500);
        }

        $saved = [];
        $rejected = [];
        foreach ($files as $file) {
            /** @var UploadedFileInterface $file */
            $name = basename((string) $file->getClientFilename());
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

            if ($file->getError() !== UPLOAD_ERR_OK) {
                $rejected[] = ['name' => $name, 'reason' => 'Upload failed (code ' . $file->getError() . ').'];
                continue;
            }
            if (!in_array($ext, self::ALLOWED, true)) {
                $rejected[] = ['name' => $name, 'reason' => 'Only PDF, DOCX, TXT and MD files are supported.'];
                continue;
            }
            if ($file->getSize() > self::MAX_BYTES) {
                $rejected[] = ['name' => $name, 'reason' => 'File is over 20 MB.'];
                continue;
            }

            $stored = bin2hex(random_bytes(8)) . '.' . $ext;
            $file->moveTo($dir . '/' . $stored);
            $saved[] = ['name' => $name, 'stored_as' => $stored, 'size' => $file->getSize()];

            // Record it in the DB if available; a missing DB shouldn't block guests.
            try {
                $pdo = $this->container->get(PDOService::class)->getPDO();
                $stmt = $pdo->prepare('INSERT INTO documents (user_id, guest_session, original_name, stored_name, size_bytes) VALUES (?, ?, ?, ?, ?)');
                $stmt->execute([$user['id'] ?? null, $user ? null : session_id(), $name, $stored, $file->getSize()]);
            } catch (\Throwable $e) {
                // ignore for now
            }
        }

        return $this->json($response, ['saved' => $saved, 'rejected' => $rejected, 'guest' => $user === null], $saved ? 201 : 422);
    }

    protected function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_SLASHES));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
