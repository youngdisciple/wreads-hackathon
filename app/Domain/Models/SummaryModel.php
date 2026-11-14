<?php

declare(strict_types=1);

namespace App\Domain\Models;

class SummaryModel extends BaseModel
{
    public function findForUser(string $fileKey, int $userId): array|false
    {
        return $this->selectOne('SELECT * FROM summaries WHERE file_key = ? AND user_id = ?', [$fileKey, $userId]);
    }

    public function findAllByUser(int $userId): array
    {
        return $this->selectAll(
            'SELECT id, upload_id, file_key, original_name, word_count, created_at
             FROM summaries WHERE user_id = ? ORDER BY created_at DESC',
            [$userId]
        );
    }

    public function save(array $summary): void
    {
        $this->execute(
            'INSERT INTO summaries (id, user_id, upload_id, file_key, original_name, content, word_count)
             VALUES (:id, :user_id, :upload_id, :file_key, :original_name, :content, :word_count)
             ON DUPLICATE KEY UPDATE
                upload_id = VALUES(upload_id), original_name = VALUES(original_name),
                content = VALUES(content), word_count = VALUES(word_count), created_at = CURRENT_TIMESTAMP',
            $summary
        );
    }

    public function delete(string $fileKey, int $userId): bool
    {
        return $this->execute('DELETE FROM summaries WHERE file_key = ? AND user_id = ?', [$fileKey, $userId]) > 0;
    }
}
