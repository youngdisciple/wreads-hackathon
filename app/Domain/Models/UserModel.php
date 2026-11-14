<?php

declare(strict_types=1);

namespace App\Domain\Models;

class UserModel extends BaseModel
{
    public function findByEmail(string $email): array|false
    {
        return $this->selectOne('SELECT * FROM users WHERE email = ?', [$email]);
    }

    /** Public fields only (never the password hash). */
    public function findById(int $id): array|false
    {
        return $this->selectOne('SELECT id, username, email, created_at FROM users WHERE id = ?', [$id]);
    }

    public function usernameOrEmailTaken(string $username, string $email): bool
    {
        return $this->count('SELECT COUNT(*) FROM users WHERE username = ? OR email = ?', [$username, $email]) > 0;
    }

    public function create(string $username, string $email, string $password): int
    {
        $this->execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [$username, $email, password_hash($password, PASSWORD_DEFAULT)]
        );
        return (int) $this->lastInsertId();
    }
}
