-- wreads database schema (MySQL / MariaDB)
-- MAMP/XAMPP: phpMyAdmin -> Import -> choose this file. It creates the `wreads` database.
-- Re-importing drops and recreates the tables (all data is lost).

CREATE DATABASE IF NOT EXISTS wreads
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE wreads;

-- results/documents are leftovers from an earlier version of the schema.
DROP TABLE IF EXISTS results;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS uploads;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(30) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Files saved by logged-in users. Guest uploads are never stored.
CREATE TABLE uploads (
    id CHAR(36) PRIMARY KEY,                -- random UUID made by the backend, e.g. f49df72c-5713-4be9-92a4-58af329c414a
    user_id INT NOT NULL,
    original_name VARCHAR(255) NOT NULL,    -- name of the file the user uploaded
    file_name VARCHAR(64) NOT NULL,         -- name on disk in var/uploads/, e.g. <id>.pdf
    size_bytes INT UNSIGNED NOT NULL,
    content MEDIUMTEXT NOT NULL,            -- extracted text; pages separated by a blank line
    page_count INT UNSIGNED NOT NULL DEFAULT 0,
    word_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_uploads_user (user_id, created_at),
    CONSTRAINT fk_uploads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
