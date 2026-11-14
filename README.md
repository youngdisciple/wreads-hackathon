# wreads

**wreading** (n.): the act of writing and reading at the same time.

wreads is a study helper. Upload a PDF or your notes and it turns them into a
monkeytype-style typing test: the pages of your document become the words you type.
Typing the material is how you study it.

## What it does

- **Type-along:** your document, split into short parts, typed on your keyboard with live accuracy and speed.
- **Mad libs:** the same text with key words blanked out for you to fill in.
- **Flashcards:** a deck built from your text, each card hiding a key term. Flip to check, then mark it "Got it" or "Again".
- **Summarize (logged-in users):** a purple **Summarize** button sends the document to Claude, which condenses it into shorter, clearer notes. The button then becomes an **Original / Summary** toggle, so you can type either the full text or the notes.
- **Guests welcome:** without an account you can still upload and study. Your files stay in your browser; summarizing is locked.
- **Accounts:** sign up to keep your uploads on the server and unlock summarizing.

Supported files: PDF, DOCX, TXT and Markdown, up to 20 MB. Scanned PDFs with no selectable text can't be read.

## Tech stack

| Layer | What |
| --- | --- |
| Frontend | React 18 + htm, loaded from esm.sh as ES modules (no build step) |
| Backend | PHP 8.2+ on the Slim 4 framework, MVC layout |
| Database | MySQL / MariaDB |
| AI | Claude, through the official Anthropic PHP SDK |
| PDF text | pdf.js in the browser, `smalot/pdfparser` on the server |

## Getting started

### Requirements

- PHP 8.2 or newer with the `pdo_mysql`, `mbstring`, `curl` and `iconv` extensions
- [Composer](https://getcomposer.org/)
- MySQL or MariaDB
- An Anthropic API key, only if you want the Summarize button to work

### Setup

1. Install the PHP packages:
   ```bash
   composer install
   ```
2. Create the database by importing `data/wreads.sql`. It creates a database called `wreads` with the `users` and `uploads` tables. Re-importing wipes it.
3. Copy the config template and fill it in:
   ```bash
   cp config/env.example.php config/env.php
   ```
   - `db`: your database name, username and password.
   - `anthropic.api_key`: your key from <https://console.anthropic.com>.
   - `anthropic.allow_guests`: leave it `false`. Set it to `true` only on your own machine if you want to test Summarize without logging in.

   `config/env.php` is gitignored. Never commit your API key.

### Run it

**PHP's built-in server** (simplest):

```bash
composer start
```

Open <http://localhost:8080/>. The dashboard is at <http://localhost:8080/dashboard>.

**XAMPP / MAMP:**

1. Put the project in `htdocs/wreads-hackaton`. The folder name becomes the URL path.
2. Start Apache and MySQL.
3. Open <http://localhost/wreads-hackaton/> (MAMP: <http://localhost:8888/wreads-hackaton/>).

The app works out its own base path, so the same code runs at the site root or in a subfolder.

## Using the summarizer

1. Log in, then open the dashboard and pick a file.
2. Click **✦ Summarize** at the top right of the view.
3. When Claude finishes, the notes are saved to `public/summarized/<file-id>.txt` and the button becomes the **Original / Summary** toggle. The toggle applies to all three study modes.

A file is only summarized once: later visits reuse the saved `.txt`. Guests see the button greyed out and can't press it, and the server rejects their requests with a `401`.

The model is set by the `MODEL` constant in `app/Controllers/SummarizeController.php`.

## API

All routes return JSON. Logins use a PHP session cookie. Errors look like `{"error": "message"}`.

| Method & route | Who | Send | Returns |
| --- | --- | --- | --- |
| `POST /api/auth/register` | anyone | JSON `{username, email, password}` | `201 {user}` · `409` taken · `422` invalid |
| `POST /api/auth/login` | anyone | JSON `{email, password}` | `{user}` · `401` wrong login |
| `POST /api/auth/logout` | anyone | | `{ok: true}` |
| `GET /api/auth/me` | anyone | | `{user}` or `{user: null}` for guests |
| `POST /api/upload` | anyone | `FormData` with `files[]` | `{guest, files: [...], rejected: [...]}` |
| `GET /api/uploads` | logged in | | `{uploads: [...]}` |
| `GET /api/uploads/{id}` | owner | | `{upload: {..., pages: [...]}}` |
| `GET /api/uploads/{id}/file` | owner | | the original file |
| `DELETE /api/uploads/{id}` | owner | | `{ok: true}` |
| `POST /api/summarize` | logged in | JSON `{id, name, text}` | `{summary, cached}` · `401` guest · `413` too long |

`user` is `{id, username, email}`. Each uploaded file comes back as
`{id, name, size, page_count, word_count, pages}`, where `pages` is an array of
strings: the text to type, one short test per page, cleaned of symbols you can't type.

For guests, the server only extracts the text and sends it back; nothing is saved.
For logged-in users, the file is also stored in `var/uploads/` and listed by `GET /api/uploads`.

## Project layout

| What | Where |
| --- | --- |
| Front controller | `public/index.php` |
| Page routes / API routes | `app/Routes/web-routes.php`, `app/Routes/api-routes.php` |
| Landing page | `app/Views/landingView.php`, `public/assets/js/landing.js`, `public/assets/css/landing.css` |
| Dashboard (file sidebar + study modes) | `app/Views/dashboardView.php`, `public/assets/js/dashboard.js`, `public/assets/css/dashboard.css` |
| Guest files kept in the browser (IndexedDB) | `public/assets/js/local-files.js` |
| Browser-side API helpers | `public/assets/js/auth-api.js`, `public/assets/js/uploads-api.js` |
| Login / sign-up | `app/Controllers/AuthController.php`, `app/Domain/Models/UserModel.php` |
| Uploads | `app/Controllers/UploadController.php`, `app/Domain/Models/UploadModel.php` |
| PDF / DOCX to typeable pages | `app/Domain/Services/TextExtractor.php` |
| Summarizer (Claude) | `app/Controllers/SummarizeController.php` |
| Saved summaries | `public/summarized/` |
| Session and login check | `app/Middleware/SessionMiddleware.php`, `app/Middleware/AuthMiddleware.php` |
| Database schema | `data/wreads.sql` |
| Settings | `config/defaults.php`, then `config/settings.{dev,prod}.php`, then `config/env.php` |

## Tests

```bash
node --test tests/              # browser-side API helpers
php tests/upload-routes.php     # upload routes (no database needed for guest uploads)
```

## Troubleshooting

- **"Failed to connect to the database … Access denied":** the username, password or database name in `config/env.php` doesn't match your MySQL setup. On Linux, MariaDB's `root` account often can't log in with a password; create a dedicated user for the app and use that.
- **"wreads needs JavaScript turned on":** JavaScript is disabled in the browser, or an extension is blocking it.
- **Blank page:** the UI loads React from `esm.sh` and fonts from Google at runtime, so it needs an internet connection.
- **"The summarizer is not set up yet":** `anthropic.api_key` is empty in `config/env.php`.
- **"PDFs can't be read on this server yet":** PHP's `iconv` extension is off. Enable `extension=iconv` in `php.ini`, then restart the server: a server that was already running keeps its old settings.

## Known limitations

- Files in `public/summarized/` are publicly readable by anyone who knows the URL.
- The Docker files still come from the starter template and point at a different database (`slim_mvc`); they don't create the wreads tables.
- `GET /phpinfo` is a debug route and should be removed before any public deployment.

## Credits

Built at a hackathon on the [Slim 4 MVC starter template](https://github.com/frostybee/slim-mvc) by frostybee. Licensed under MIT; see `LICENSE`.
