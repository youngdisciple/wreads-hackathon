<?php

declare(strict_types=1);

namespace App\Controllers;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Shared helpers for the JSON API controllers. */
abstract class ApiController extends BaseController
{
    protected function json(Response $response, mixed $data, int $status = 200): Response
    {
        $response->getBody()->write((string) json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    protected function error(Response $response, string $message, int $status = 400): Response
    {
        return $this->json($response, ['error' => $message], $status);
    }

    protected function body(Request $request): array
    {
        $body = $request->getParsedBody();
        return is_array($body) ? $body : [];
    }

    /** The logged-in user ['id', 'username', 'email'], or null for guests. */
    protected function currentUser(): ?array
    {
        return $_SESSION['user'] ?? null;
    }

    protected function userId(): int
    {
        return (int) ($_SESSION['user']['id'] ?? 0);
    }
}
