# CLAUDE.md

## Shared agent instructions
`AGENTS.md` is a symlink to `CLAUDE.md`. Both names share this file's contents, so edits through either name apply to both. Preserve the symlink when updating these instructions; do not replace it with a separate file.

## What this is
**wreads**: a hackathon app that helps students study by uploading PDFs/notes and getting them back as a type-along session (monkeytype-style) or fill-in-the-blank mad libs. Built on the **Slim 4 PHP MVC starter** (`frostybee/slim-mvc`) with a **no-build React UI**.

## Tech stack
- **Frontend:** React
- **Backend:** PHP
- **Framework:** Slim PHP framework
- **Database:** MySQL

## Running
- XAMPP (primary): project at `htdocs/wreads-hackaton`, import `database/wreads.sql`, copy `config/env.example.php` → `config/env.php`, `composer install`, open `http://localhost/wreads-hackaton/`.
- Built-in server: `composer start` (serves `public/` on `localhost:8080`).
- Docker: `docker compose up` (app :8080, phpMyAdmin :8081) — see known issues.
- PHP >= 8.2. No test suite.

## Request flow
`public/index.php` → `config/bootstrap.php` (autoload, `constants.php`, `functions.php`, PHP-DI) → `config/container.php` (Slim app, base path = `/<project folder name>` i.e. `/wreads-hackaton`, overridable via `APP_ROOT_DIR` env) → `app/Routes/web-routes.php` + `config/middleware.php`.

Settings merge: `config/defaults.php` → `config/settings.{dev|prod}.php` → `config/env.php` (required, gitignored).

## Routes
| Route | Handler |
|---|---|
| `GET /`, `/home` | `HomeController::index` → `app/Views/landingView.php` (passes `base_path`) |
| `POST /api/auth/register`, `/login`, `/logout`; `GET /api/auth/me` | `app/Controllers/AuthController.php` — PHP session (`$_SESSION['user']`), `password_hash` |
| `POST /api/upload` (multipart `files[]`) | `app/Controllers/UploadController.php` — pdf/docx/txt/md, ≤20 MB, saved to `var/uploads/{user-ID\|guest-SESSIONID}/`, row inserted into `documents` (DB failure is ignored so guests still work) |
| `GET /phpinfo`, `GET /error` | Template debug routes |

Route naming convention: `[controller].[method]`. Controllers extend `BaseController` (gets the DI container, `render()`, `redirect()`); JSON controllers define their own `json()` helper.

## Frontend
- `app/Views/landingView.php`: page shell; sets `window.WREADS.basePath` so JS builds URLs correctly when served from a subfolder.
- `public/assets/js/landing.js`: React 18 + htm imported from esm.sh (ES module, no build step). Components: `TypeDemo`, `MadLibsDemo`, `DropZone` (upload), `AuthModal`, `App` (checks `/auth/me` on load). Use `api(path)` for API URLs.
- `public/assets/css/landing.css`: styles (fonts: Fraunces, JetBrains Mono, Inter).

## Data
`database/wreads.sql` (DB `wreads`):
- `users` (id, username UNIQUE, email UNIQUE, password_hash, created_at, updated_at)
- `documents` (id, user_id NULL FK→users, guest_session NULL, original_name, stored_name, size_bytes, created_at)

DB access via `App\Helpers\Core\PDOService` (`$this->container->get(PDOService::class)->getPDO()`).

## Not built yet
- Turning uploads into sessions: no text extraction, no type-along / mad-libs generation from user files.
- `app/Domain/Models` and `app/Domain/Services` contain only template base classes.

## Known issues
- Docker DB mismatch: `docker-compose.yml` / `config/env.docker.php` use DB `slim_mvc`, and `docker/init-db/01-schema.sql` has only a commented-out `users` table — the wreads tables are not created under Docker.
- `/phpinfo` debug route is exposed; remove before any public deploy.
- UI depends on esm.sh at runtime (no offline use).
- Each controller calls `session_start()` itself; the session middleware in `config/middleware.php` is commented out.
