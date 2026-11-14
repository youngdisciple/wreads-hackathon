<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Core\PDOService;
use DI\Container;
use PDOException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Minimal JSON auth endpoints used by the landing page's login / sign-up modal.
 *
 *   POST /api/auth/register  { username, email, password }
 *   POST /api/auth/login     { email, password }
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 */
class AuthController extends BaseController
{
    public function __construct(Container $container)
    {
        parent::__construct($container);
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }

    public function register(Request $request, Response $response, array $args): Response
    {
        $body = (array) $request->getParsedBody();
        $username = trim((string) ($body['username'] ?? ''));
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        if (!preg_match('/^[A-Za-z0-9_.-]{3,30}$/', $username)) {
            return $this->json($response, ['error' => 'Username must be 3–30 letters, numbers, dots, dashes or underscores.'], 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->json($response, ['error' => 'Please enter a valid email.'], 422);
        }
        if (strlen($password) < 8) {
            return $this->json($response, ['error' => 'Password must be at least 8 characters.'], 422);
        }

        try {
            $pdo = $this->container->get(PDOService::class)->getPDO();
            $stmt = $pdo->prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
            $stmt->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $id = (int) $pdo->lastInsertId();
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                return $this->json($response, ['error' => 'That username or email is already taken.'], 409);
            }
            return $this->json($response, ['error' => 'Database unavailable. Is MySQL running in XAMPP?'], 500);
        }

        session_regenerate_id(true);
        $_SESSION['user'] = ['id' => $id, 'username' => $username, 'email' => $email];

        return $this->json($response, ['user' => $_SESSION['user']], 201);
    }

    public function login(Request $request, Response $response, array $args): Response
    {
        $body = (array) $request->getParsedBody();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        try {
            $pdo = $this->container->get(PDOService::class)->getPDO();
            $stmt = $pdo->prepare('SELECT id, username, email, password_hash FROM users WHERE email = ?');
            $stmt->execute([$email]);
            $row = $stmt->fetch();
        } catch (PDOException $e) {
            return $this->json($response, ['error' => 'Database unavailable. Is MySQL running in XAMPP?'], 500);
        }

        if (!$row || !password_verify($password, $row['password_hash'])) {
            return $this->json($response, ['error' => 'Wrong email or password.'], 401);
        }

        session_regenerate_id(true);
        $_SESSION['user'] = ['id' => (int) $row['id'], 'username' => $row['username'], 'email' => $row['email']];

        return $this->json($response, ['user' => $_SESSION['user']]);
    }

    public function logout(Request $request, Response $response, array $args): Response
    {
        $_SESSION = [];
        session_destroy();
        return $this->json($response, ['ok' => true]);
    }

    public function me(Request $request, Response $response, array $args): Response
    {
        return $this->json($response, ['user' => $_SESSION['user'] ?? null]);
    }

    protected function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_SLASHES));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
