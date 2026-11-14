<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Domain\Models\UserModel;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * POST /api/auth/register  {username, email, password}
 * POST /api/auth/login     {email, password}
 * POST /api/auth/logout
 * GET  /api/auth/me        -> {user} or {user: null} for guests
 */
class AuthController extends ApiController
{
    public function register(Request $request, Response $response): Response
    {
        $body = $this->body($request);
        $username = trim((string) ($body['username'] ?? ''));
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        if (!preg_match('/^[A-Za-z0-9_.-]{3,30}$/', $username)) {
            return $this->error($response, 'Username must be 3-30 letters, numbers, dots, dashes or underscores.', 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->error($response, 'Please enter a valid email.', 422);
        }
        if (strlen($password) < 8) {
            return $this->error($response, 'Password must be at least 8 characters.', 422);
        }

        $users = $this->container->get(UserModel::class);
        if ($users->usernameOrEmailTaken($username, $email)) {
            return $this->error($response, 'That username or email is already taken.', 409);
        }

        $id = $users->create($username, $email, $password);
        return $this->json($response, ['user' => $this->startSession($users, $id)], 201);
    }

    public function login(Request $request, Response $response): Response
    {
        $body = $this->body($request);
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        $users = $this->container->get(UserModel::class);
        $row = $users->findByEmail($email);
        if (!$row || !password_verify($password, $row['password_hash'])) {
            return $this->error($response, 'Wrong email or password.', 401);
        }

        return $this->json($response, ['user' => $this->startSession($users, (int) $row['id'])]);
    }

    public function logout(Request $request, Response $response): Response
    {
        $_SESSION = [];
        session_destroy();
        return $this->json($response, ['ok' => true]);
    }

    public function me(Request $request, Response $response): Response
    {
        return $this->json($response, ['user' => $this->currentUser()]);
    }

    /** Store the user in the session and return the public user object. */
    private function startSession(UserModel $users, int $id): array
    {
        $user = $users->findById($id);
        session_regenerate_id(true); // new session id after login (prevents session fixation)
        $_SESSION['user'] = ['id' => (int) $user['id'], 'username' => $user['username'], 'email' => $user['email']];
        return $_SESSION['user'];
    }
}
