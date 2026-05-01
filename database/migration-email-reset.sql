-- =====================================================================
-- Talabna — Email-verified password reset
-- Adds verification code columns to password_resets
-- =====================================================================
USE mvd_app;

-- Drop the simple table from the previous migration if it has no data
-- (the simple version only had: resetID, userID, resetAt)
-- We rebuild it with the new columns.

DROP TABLE IF EXISTS password_resets;

CREATE TABLE password_resets (
    resetID    INT AUTO_INCREMENT PRIMARY KEY,
    userID     INT NOT NULL,
    codeHash   VARCHAR(255) NOT NULL,    -- bcrypt hash of the 6-digit code
    expiresAt  DATETIME NOT NULL,        -- 15 minutes from creation
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userID) REFERENCES users(userID) ON DELETE CASCADE,
    INDEX idx_reset_user_active (userID, used, expiresAt)
);

-- Verify
SHOW COLUMNS FROM password_resets;
