-- Add summary storage without changing existing accounts or uploads.
CREATE TABLE IF NOT EXISTS summaries (
    id CHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    upload_id CHAR(36) NULL,
    file_key VARCHAR(80) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    word_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_summaries_user_file (user_id, file_key),
    INDEX idx_summaries_user (user_id, created_at),
    CONSTRAINT fk_summaries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_summaries_upload FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
