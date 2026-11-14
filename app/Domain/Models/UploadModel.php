<?php

declare(strict_types=1);

namespace App\Domain\Models;

class UploadModel extends BaseModel
{
    /** A random UUID (version 4) used as the upload's primary key and file name. */
    public static function newId(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40); // version 4
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80); // RFC 4122 variant
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }

    /** A user's uploads, newest first, without the text. */
    public function findAllByUser(int $userId): array
    {
        return $this->selectAll(
            'SELECT id, original_name, size_bytes, page_count, word_count, created_at
             FROM uploads WHERE user_id = ? ORDER BY created_at DESC',
            [$userId]
        );
    }

    /** One upload (with its text), only if it belongs to this user. */
    public function findForUser(string $id, int $userId): array|false
    {
        return $this->selectOne('SELECT * FROM uploads WHERE id = ? AND user_id = ?', [$id, $userId]);
    }

    public function create(array $upload): void
    {
        $this->execute(
            'INSERT INTO uploads (id, user_id, original_name, file_name, size_bytes, content, page_count, word_count)
             VALUES (:id, :user_id, :original_name, :file_name, :size_bytes, :content, :page_count, :word_count)',
            $upload
        );
    }

    public function delete(string $id, int $userId): bool
    {
        return $this->execute('DELETE FROM uploads WHERE id = ? AND user_id = ?', [$id, $userId]) > 0;
    }
}
