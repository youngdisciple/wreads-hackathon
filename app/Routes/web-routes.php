<?php

declare(strict_types=1);

/**
 * This file contains the routes for the web application.
 */

use App\Controllers\HomeController;
use App\Controllers\SummarizeController;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;


return static function (Slim\App $app): void {


    //* NOTE: Route naming pattern: [controller_name].[method_name]
    $app->get('/', [HomeController::class, 'index'])
        ->setName('home.index');

    $app->get('/home', [HomeController::class, 'index'])
        ->setName('home.index');

    $app->get('/dashboard', [HomeController::class, 'dashboard'])
        ->setName('home.dashboard');

    $app->post('/api/summarize', [SummarizeController::class, 'summarize'])
        ->setName('summarize.summarize');
    $app->get('/api/summarize/{key:[A-Za-z0-9_-]{1,80}}', [SummarizeController::class, 'show'])
        ->setName('summarize.show');

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
