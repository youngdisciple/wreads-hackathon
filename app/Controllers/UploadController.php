<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Domain\Models\UploadModel;
use App\Domain\Services\TextExtractor;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\UploadedFileInterface;
use Slim\Psr7\Stream;

/**
 * POST   /api/upload              (multipart/form-data, field "files[]")  guests + users
 *          Guests: the text is extracted and returned; nothing is stored.
 *          Users:  the file is saved to var/uploads/<id>.<ext> and a row is added to `uploads`.
 * GET    /api/uploads             the user's saved uploads (no text)
 * GET    /api/uploads/{id}        one upload with its "pages" to type
 * GET    /api/uploads/{id}/file   the original file
 * DELETE /api/uploads/{id}
 */
class UploadController extends ApiController
{
    private const MAX_BYTES = 20 * 1024 * 1024; // 20 MB per file
    private const TYPES = [
        'pdf' => 'application/pdf',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt' => 'text/plain; charset=utf-8',
        'md' => 'text/markdown; charset=utf-8',
    ];

    public function store(Request $request, Response $response): Response
    {
        $files = $request->getUploadedFiles()['files'] ?? [];
        if ($files instanceof UploadedFileInterface) {
            $files = [$files];
        }
        if (!$files) {
            return $this->error($response, 'No files received. Send them as "files[]".', 400);
        }

        $userId = $this->userId();
        $extractor = $this->container->get(TextExtractor::class);
        $uploads = $this->container->get(UploadModel::class);

        $done = [];
        $rejected = [];
        foreach ($files as $file) {
            /** @var UploadedFileInterface $file */
            $name = basename((string) $file->getClientFilename());
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

            if ($file->getError() !== UPLOAD_ERR_OK) {
                $rejected[] = ['name' => $name, 'reason' => $this->uploadErrorMessage($file->getError())];
                continue;
            }
            if (!isset(self::TYPES[$ext])) {
                $rejected[] = ['name' => $name, 'reason' => 'Only PDF, DOCX, TXT and MD files are supported.'];
                continue;
            }
            if ($file->getSize() > self::MAX_BYTES) {
                $rejected[] = ['name' => $name, 'reason' => 'File is over 20 MB.'];
                continue;
            }

            // Guests: work on a temp file that is deleted right after. Users: keep it.
            $id = $userId ? UploadModel::newId() : null;
            $path = $id ? $this->uploadDir() . '/' . $id . '.' . $ext : $this->tempPath($ext);
            $file->moveTo($path);

            $pages = $extractor->extract($path, $ext);
            if (!$pages) {
                @unlink($path);
                $rejected[] = ['name' => $name, 'reason' => 'No text found in this file (it may be a scanned PDF).'];
                continue;
            }

            $wordCount = $extractor->wordCount(implode(' ', $pages));
            if ($id) {
                $uploads->create([
                    'id' => $id,
                    'user_id' => $userId,
                    'original_name' => mb_substr($name, 0, 255),
                    'file_name' => basename($path),
                    'size_bytes' => (int) $file->getSize(),
                    'content' => implode(TextExtractor::PAGE_SEPARATOR, $pages),
                    'page_count' => count($pages),
                    'word_count' => $wordCount,
                ]);
            } else {
                @unlink($path);
            }

            $done[] = [
                'id' => $id, // null for guests
                'name' => $name,
                'size' => (int) $file->getSize(),
                'page_count' => count($pages),
                'word_count' => $wordCount,
                'pages' => $pages,
            ];
        }

        return $this->json(
            $response,
            ['guest' => $userId === 0, 'files' => $done, 'rejected' => $rejected],
            $done ? 201 : 422
        );
    }

    public function index(Request $request, Response $response): Response
    {
        $list = $this->container->get(UploadModel::class)->findAllByUser($this->userId());
        return $this->json($response, ['uploads' => $list]);
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $upload = $this->container->get(UploadModel::class)->findForUser($args['id'], $this->userId());
        if (!$upload) {
            return $this->error($response, 'Upload not found.', 404);
        }

        $upload['pages'] = explode(TextExtractor::PAGE_SEPARATOR, $upload['content']);
        unset($upload['content'], $upload['file_name'], $upload['user_id']);
        return $this->json($response, ['upload' => $upload]);
    }

    public function file(Request $request, Response $response, array $args): Response
    {
        $upload = $this->container->get(UploadModel::class)->findForUser($args['id'], $this->userId());
        $path = $upload ? $this->uploadDir() . '/' . $upload['file_name'] : '';
        if (!$upload || !is_file($path)) {
            return $this->error($response, 'File not found.', 404);
        }

        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $filename = str_replace('"', '', $upload['original_name']);
        return $response
            ->withBody(new Stream(fopen($path, 'rb')))
            ->withHeader('Content-Type', self::TYPES[$ext] ?? 'application/octet-stream')
            ->withHeader('Content-Disposition', 'inline; filename="' . $filename . '"')
            ->withHeader('Content-Length', (string) filesize($path));
    }

    public function destroy(Request $request, Response $response, array $args): Response
    {
        $uploads = $this->container->get(UploadModel::class);
        $upload = $uploads->findForUser($args['id'], $this->userId());
        if (!$upload) {
            return $this->error($response, 'Upload not found.', 404);
        }

        $uploads->delete($upload['id'], $this->userId());
        @unlink($this->uploadDir() . '/' . $upload['file_name']);
        return $this->json($response, ['ok' => true]);
    }

    /** A unique temp file path with the right extension (the extractor needs it). */
    private function tempPath(string $ext): string
    {
        return sys_get_temp_dir() . '/wreads_' . bin2hex(random_bytes(8)) . '.' . $ext;
    }

    private function uploadDir(): string
    {
        $dir = APP_BASE_DIR_PATH . '/var/uploads';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        return $dir;
    }

    private function uploadErrorMessage(int $code): string
    {
        return match ($code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'File is bigger than the server allows.',
            UPLOAD_ERR_PARTIAL => 'File only partly uploaded. Try again.',
            UPLOAD_ERR_NO_FILE => 'No file was sent.',
            default => 'Upload failed (code ' . $code . ').',
        };
    }
}
