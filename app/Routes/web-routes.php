<?php

declare(strict_types=1);

/**
 * This file contains the routes for the web application.
 */

use App\Controllers\AuthController;
use App\Controllers\HomeController;
use App\Controllers\UploadController;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;


return static function (Slim\App $app): void {


    //* NOTE: Route naming pattern: [controller_name].[method_name]
    $app->get('/', [HomeController::class, 'index'])
        ->setName('home.index');

    $app->get('/home', [HomeController::class, 'index'])
        ->setName('home.index');

    //* wreads JSON endpoints used by the landing page.
    $app->group('/api', function (RouteCollectorProxy $group) {
        $group->post('/auth/register', [AuthController::class, 'register'])->setName('auth.register');
        $group->post('/auth/login', [AuthController::class, 'login'])->setName('auth.login');
        $group->post('/auth/logout', [AuthController::class, 'logout'])->setName('auth.logout');
        $group->get('/auth/me', [AuthController::class, 'me'])->setName('auth.me');

        $group->post('/upload', [UploadController::class, 'store'])->setName('upload.store');
    });

    // A route to display PHP configuration information.
    $app->get('/phpinfo', function (Request $request, Response $response, $args) {
        ob_start();
        phpinfo();
        $phpinfo = ob_get_clean();
        $response->getBody()->write($phpinfo);
        return $response;
    });

    // A route to test runtime error handling and custom exceptions.
    $app->get('/error', function (Request $request, Response $response, $args) {
        throw new \Slim\Exception\HttpBadRequestException($request, "This is a runtime error. Something went wrong");
    });
};
