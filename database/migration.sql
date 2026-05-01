-- =====================================================================
-- Talabna — Feature update migration
-- Adds: order_groups (multi-store), favorites, password_resets
-- =====================================================================
USE mvd_app;

-- ---------- Multi-store: order group ----------
-- A single "session" of multi-store ordering. One order_group has many orders.
CREATE TABLE IF NOT EXISTS order_groups (
    groupID    INT AUTO_INCREMENT PRIMARY KEY,
    customerID INT NOT NULL,
    totalPrice DECIMAL(10,2) NOT NULL DEFAULT 0,
    createdAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customerID) REFERENCES users(userID),
    INDEX idx_groups_customer (customerID)
);

-- Link each order to its group (nullable: legacy single-store orders have no group)
ALTER TABLE orders
  ADD COLUMN groupID INT NULL AFTER cartID,
  ADD CONSTRAINT fk_orders_group FOREIGN KEY (groupID) REFERENCES order_groups(groupID) ON DELETE SET NULL;

-- ---------- Favorites ----------
CREATE TABLE IF NOT EXISTS favorites (
    userID   INT NOT NULL,
    vendorID INT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userID, vendorID),
    FOREIGN KEY (userID)   REFERENCES users(userID)     ON DELETE CASCADE,
    FOREIGN KEY (vendorID) REFERENCES vendors(vendorID) ON DELETE CASCADE
);

-- ---------- Password reset tokens ----------
-- Used by the simple flow: user identifies themselves and immediately resets.
-- We still keep this table to record events for the audit log + rate-limiting.
CREATE TABLE IF NOT EXISTS password_resets (
    resetID    INT AUTO_INCREMENT PRIMARY KEY,
    userID     INT NOT NULL,
    resetAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userID) REFERENCES users(userID) ON DELETE CASCADE,
    INDEX idx_reset_user (userID)
);

-- ---------- Special instructions per item ----------
ALTER TABLE order_items
  ADD COLUMN specialInstructions TEXT NULL AFTER unitPrice;

-- ---------- Multi-store: unified delivery group status ----------
ALTER TABLE order_groups
  ADD COLUMN status ENUM('pending_vendors','ready_for_driver','assigned','delivered','cancelled')
    NOT NULL DEFAULT 'pending_vendors' AFTER totalPrice;

-- ---------- Delivery fee & payment method ----------
ALTER TABLE orders
  ADD COLUMN deliveryFee DECIMAL(10,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN paymentMethod ENUM('cash','card') NOT NULL DEFAULT 'cash';

-- Verify
SHOW TABLES LIKE 'order_groups';
SHOW TABLES LIKE 'favorites';
SHOW TABLES LIKE 'password_resets';
SHOW COLUMNS FROM orders LIKE 'groupID';
