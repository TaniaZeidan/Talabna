-- =====================================================================
-- Multi-Vendor Delivery Web Application
-- Database Schema (MySQL)
-- Derived from the Logical Data Model in the SRS (Section 3.1.2)
-- =====================================================================

DROP DATABASE IF EXISTS mvd_app;
CREATE DATABASE mvd_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mvd_app;

-- ---------------------------------------------------------------------
-- USER: All system actors (customer, vendor, driver, admin)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    userID        INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(20)  NOT NULL UNIQUE,
    password      VARCHAR(255) NOT NULL,           -- bcrypt hash
    email         VARCHAR(120) NOT NULL UNIQUE,
    phone         VARCHAR(30)  NOT NULL,
    role          ENUM('customer','vendor','driver','admin') NOT NULL,
    accountStatus ENUM('active','pending','suspended') NOT NULL DEFAULT 'active',
    createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_role (role),
    INDEX idx_users_status (accountStatus)
);

-- ---------------------------------------------------------------------
-- VENDOR: Business profile linked to a user with role='vendor'
-- ---------------------------------------------------------------------
CREATE TABLE vendors (
    vendorID     INT AUTO_INCREMENT PRIMARY KEY,
    userID       INT NOT NULL UNIQUE,
    businessName VARCHAR(120) NOT NULL,
    address      VARCHAR(255) NOT NULL,
    category     VARCHAR(60)  NOT NULL,
    status       ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
    rating       DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (userID) REFERENCES users(userID) ON DELETE CASCADE,
    INDEX idx_vendors_status (status),
    INDEX idx_vendors_category (category)
);

-- ---------------------------------------------------------------------
-- PRODUCT: Catalog items owned by a vendor
-- ---------------------------------------------------------------------
CREATE TABLE products (
    productID    INT AUTO_INCREMENT PRIMARY KEY,
    vendorID     INT NOT NULL,
    name         VARCHAR(120) NOT NULL,
    description  TEXT,
    price        DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    category     VARCHAR(60)  NOT NULL,
    availability INT NOT NULL DEFAULT 0 CHECK (availability >= 0),
    imageUrl     VARCHAR(255),
    FOREIGN KEY (vendorID) REFERENCES vendors(vendorID) ON DELETE CASCADE,
    INDEX idx_products_vendor (vendorID),
    INDEX idx_products_category (category)
);

-- ---------------------------------------------------------------------
-- ORDERS: Customer order header
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    orderID       INT AUTO_INCREMENT PRIMARY KEY,
    customerID    INT NOT NULL,
    vendorID      INT NOT NULL,
    orderStatus   ENUM('Pending','Confirmed','InPreparation','ReadyForPickup',
                       'OnTheWay','Delivered','Cancelled','DeliveryFailed')
                  NOT NULL DEFAULT 'Pending',
    totalPrice    DECIMAL(10,2) NOT NULL,
    pointsRedeemed INT NOT NULL DEFAULT 0,
    scheduledTime DATETIME,
    cartID        INT,                              -- nullable: links to SharedCart if group order
    createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customerID) REFERENCES users(userID),
    FOREIGN KEY (vendorID) REFERENCES vendors(vendorID),
    INDEX idx_orders_customer (customerID),
    INDEX idx_orders_vendor (vendorID),
    INDEX idx_orders_status (orderStatus)
);

-- ---------------------------------------------------------------------
-- ORDER_ITEM: line items in an order
-- ---------------------------------------------------------------------
CREATE TABLE order_items (
    orderItemID INT AUTO_INCREMENT PRIMARY KEY,
    orderID     INT NOT NULL,
    productID   INT NOT NULL,
    quantity    INT NOT NULL CHECK (quantity > 0),
    unitPrice   DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (orderID) REFERENCES orders(orderID) ON DELETE CASCADE,
    FOREIGN KEY (productID) REFERENCES products(productID),
    INDEX idx_orderitems_order (orderID)
);

-- ---------------------------------------------------------------------
-- DELIVERY: 1:1 with order, assigned to a driver
-- ---------------------------------------------------------------------
CREATE TABLE deliveries (
    deliveryID   INT AUTO_INCREMENT PRIMARY KEY,
    orderID      INT NOT NULL UNIQUE,
    driverID     INT,                              -- null until accepted
    status       ENUM('Unassigned','Assigned','PickedUp','OnTheWay','Delivered','Failed')
                 NOT NULL DEFAULT 'Unassigned',
    pickupTime   DATETIME,
    deliveryTime DATETIME,
    issueReport  TEXT,
    FOREIGN KEY (orderID) REFERENCES orders(orderID) ON DELETE CASCADE,
    FOREIGN KEY (driverID) REFERENCES users(userID),
    INDEX idx_deliveries_driver (driverID),
    INDEX idx_deliveries_status (status)
);

-- ---------------------------------------------------------------------
-- LOYALTY: 1:1 with customer
-- ---------------------------------------------------------------------
CREATE TABLE loyalty (
    rewardID        INT AUTO_INCREMENT PRIMARY KEY,
    userID          INT NOT NULL UNIQUE,
    accumulatedPts  INT NOT NULL DEFAULT 0,
    redeemedPts     INT NOT NULL DEFAULT 0,
    FOREIGN KEY (userID) REFERENCES users(userID) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- REVIEW: customer review on a vendor (linked to a delivered order)
-- ---------------------------------------------------------------------
CREATE TABLE reviews (
    reviewID    INT AUTO_INCREMENT PRIMARY KEY,
    userID      INT NOT NULL,
    vendorID    INT NOT NULL,
    orderID     INT NOT NULL UNIQUE,
    rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    timestamp   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userID) REFERENCES users(userID),
    FOREIGN KEY (vendorID) REFERENCES vendors(vendorID),
    FOREIGN KEY (orderID) REFERENCES orders(orderID)
);

-- ---------------------------------------------------------------------
-- SHARED_CART: collaborative cart for group ordering
-- ---------------------------------------------------------------------
CREATE TABLE shared_carts (
    cartID         INT AUTO_INCREMENT PRIMARY KEY,
    ownerID        INT NOT NULL,                   -- designated checkout user
    vendorID       INT NOT NULL,
    inviteCode     VARCHAR(12) NOT NULL UNIQUE,
    status         ENUM('open','checked_out','cancelled') NOT NULL DEFAULT 'open',
    totalPrice     DECIMAL(10,2) NOT NULL DEFAULT 0,
    createdAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ownerID) REFERENCES users(userID),
    FOREIGN KEY (vendorID) REFERENCES vendors(vendorID)
);

-- members of a shared cart
CREATE TABLE cart_members (
    cartID INT NOT NULL,
    userID INT NOT NULL,
    PRIMARY KEY (cartID, userID),
    FOREIGN KEY (cartID) REFERENCES shared_carts(cartID) ON DELETE CASCADE,
    FOREIGN KEY (userID) REFERENCES users(userID) ON DELETE CASCADE
);

-- items added by each member (for contribution tracking)
CREATE TABLE cart_items (
    cartItemID INT AUTO_INCREMENT PRIMARY KEY,
    cartID     INT NOT NULL,
    userID     INT NOT NULL,
    productID  INT NOT NULL,
    quantity   INT NOT NULL CHECK (quantity > 0),
    FOREIGN KEY (cartID) REFERENCES shared_carts(cartID) ON DELETE CASCADE,
    FOREIGN KEY (userID) REFERENCES users(userID),
    FOREIGN KEY (productID) REFERENCES products(productID),
    INDEX idx_cartitems_cart (cartID)
);

-- ---------------------------------------------------------------------
-- AUDIT LOG: per NFR-R2 (account creation, order placement, vendor approval, delivery completion)
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    logID     INT AUTO_INCREMENT PRIMARY KEY,
    userID    INT,
    action    VARCHAR(60) NOT NULL,
    details   TEXT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userID) REFERENCES users(userID) ON DELETE SET NULL,
    INDEX idx_audit_action (action),
    INDEX idx_audit_time (timestamp)
);

-- ---------------------------------------------------------------------
-- NOTIFICATIONS: in-app notifications (per FR-C5, FR-V4, FR-V5, FR-D3)
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
    notificationID INT AUTO_INCREMENT PRIMARY KEY,
    userID    INT NOT NULL,
    message   VARCHAR(255) NOT NULL,
    relatedOrderID INT,
    isRead    BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userID) REFERENCES users(userID) ON DELETE CASCADE,
    INDEX idx_notif_user (userID, isRead)
);
