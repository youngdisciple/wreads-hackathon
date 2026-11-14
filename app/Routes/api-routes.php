<?php

declare(strict_types=1);

/**
 * wreads JSON API. All routes are under /api.
 */

use App\Controllers\AuthController;
use App\Controllers\UploadController;
use App\Middleware\AuthMiddleware;
use Slim\Routing\RouteCollectorProxy;

return static function (Slim\App $app): void {

    $app->group('/api', function (RouteCollectorProxy $api) {

        // Accounts (anyone)
        $api->post('/auth/register', [AuthController::class, 'register'])->setName('auth.register');
        $api->post('/auth/login', [AuthController::class, 'login'])->setName('auth.login');
        $api->post('/auth/logout', [AuthController::class, 'logout'])->setName('auth.logout');
        $api->get('/auth/me', [AuthController::class, 'me'])->setName('auth.me');

        // Upload (guests get the text back; users also get the file saved)
        $api->post('/upload', [UploadController::class, 'store'])->setName('upload.store');

        // Saved uploads (logged-in users, own files only)
        $api->group('/uploads', function (RouteCollectorProxy $uploads) {
            $id = '{id:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}';
            $uploads->get('', [UploadController::class, 'index'])->setName('upload.index');
            $uploads->get('/' . $id, [UploadController::class, 'show'])->setName('upload.show');
            $uploads->get('/' . $id . '/file', [UploadController::class, 'file'])->setName('upload.file');
            $uploads->delete('/' . $id, [UploadController::class, 'destroy'])->setName('upload.destroy');
        })->add(AuthMiddleware::class);
    });
};
