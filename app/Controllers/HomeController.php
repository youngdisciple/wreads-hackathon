<?php

declare(strict_types=1);

namespace App\Controllers;

use DI\Container;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class HomeController extends BaseController
{
    //NOTE: Passing the entire container violates the Dependency Inversion Principle and creates a service locator anti-pattern.
    // However, it is a simple and effective way to pass the container to the controller given the small scope of the application and the fact that this application is to be used in a classroom setting where students are not yet familiar with the Dependency Inversion Principle.
    public function __construct(Container $container)
    {
        parent::__construct($container);
    }

    /**
     * GET /  — the wreads landing page.
     */
    public function index(Request $request, Response $response, array $args): Response
    {
        $data = [
            // Used by the view to build asset + API URLs (e.g. "/wreads-hackaton").
            'base_path' => APP_ROOT_DIR_NAME ? '/' . APP_ROOT_DIR_NAME : '',
        ];

        return $this->render($response, 'landingView.php', $data);
    }

    /**
     * GET /dashboard — the wreads study dashboard.
     */
    public function dashboard(Request $request, Response $response, array $args): Response
    {
        return $this->render($response, 'dashboardView.php', [
            'base_path' => APP_ROOT_DIR_NAME ? '/' . APP_ROOT_DIR_NAME : '',
            // Guests can't summarize; the dashboard uses this to lock the button.
            'can_summarize' => SummarizeController::canSummarize($this->settings),
        ]);
    }

    public function error(Request $request, Response $response, array $args): Response
    {

        return $this->render($response, 'errorView.php');
    }
}
