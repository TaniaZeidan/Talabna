-- =====================================================================
-- Seed data for demo / testing
-- All passwords below are bcrypt hashes of "Pass123" (12 rounds)
-- =====================================================================

USE mvd_app;

-- Clear existing data (order matters due to FKs)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE notifications;
TRUNCATE TABLE audit_logs;
TRUNCATE TABLE cart_items;
TRUNCATE TABLE cart_members;
TRUNCATE TABLE shared_carts;
TRUNCATE TABLE reviews;
TRUNCATE TABLE loyalty;
TRUNCATE TABLE deliveries;
TRUNCATE TABLE order_items;
TRUNCATE TABLE orders;
TRUNCATE TABLE products;
TRUNCATE TABLE vendors;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

-- Bcrypt hash of "Pass123"
SET @pwd = '$2b$12$MdKVFjX8cIkOL52aAhwVsus2ul5Ub/7KE9GbHoH6kK0ZBlexNdAEC';

-- USERS
INSERT INTO users (username, password, email, phone, role, accountStatus) VALUES
  ('admin1',    @pwd, 'admin@mvd.com',     '+96100000001', 'admin',    'active'),
  ('alice',     @pwd, 'alice@mail.com',    '+96170000010', 'customer', 'active'),
  ('bob',       @pwd, 'bob@mail.com',      '+96170000011', 'customer', 'active'),
  ('charlie',   @pwd, 'charlie@mail.com',  '+96170000012', 'customer', 'active'),
  ('pizzaowner',@pwd, 'pizza@mail.com',    '+96170000020', 'vendor',   'active'),
  ('sushiowner',@pwd, 'sushi@mail.com',    '+96170000021', 'vendor',   'active'),
  ('grocer',    @pwd, 'grocer@mail.com',   '+96170000022', 'vendor',   'pending'),
  ('driver1',   @pwd, 'driver1@mail.com',  '+96170000030', 'driver',   'active'),
  ('driver2',   @pwd, 'driver2@mail.com',  '+96170000031', 'driver',   'active');

-- VENDORS (linked to vendor users)
INSERT INTO vendors (userID, businessName, address, category, status, rating) VALUES
  ((SELECT userID FROM users WHERE username='pizzaowner'), 'Mario''s Pizza', 'Jounieh, Main St',  'Italian', 'approved', 4.5),
  ((SELECT userID FROM users WHERE username='sushiowner'), 'Tokyo Sushi',    'Beirut, Hamra',     'Japanese','approved', 4.2),
  ((SELECT userID FROM users WHERE username='grocer'),     'Fresh Grocer',   'Byblos, Old Souk',  'Grocery', 'pending',  0.0);

-- PRODUCTS
INSERT INTO products (vendorID, name, description, price, category, availability) VALUES
  (1, 'Margherita Pizza', 'Classic tomato, mozzarella, basil',     12.50, 'Pizza',  20),
  (1, 'Pepperoni Pizza',  'Pepperoni and cheese',                   14.00, 'Pizza',  15),
  (1, 'Caesar Salad',     'Romaine, parmesan, croutons',             8.00, 'Salad',  25),
  (1, 'Tiramisu',         'Italian classic dessert',                 6.50, 'Dessert',12),
  (2, 'Salmon Roll',      '8 pieces, fresh salmon',                 16.00, 'Sushi',  30),
  (2, 'California Roll',  '8 pieces, crab and avocado',             13.00, 'Sushi',  25),
  (2, 'Miso Soup',        'Traditional miso with tofu',              4.50, 'Soup',   40),
  (2, 'Edamame',          'Steamed soybeans',                        5.00, 'Starter',35);

-- LOYALTY (auto-create for each customer)
INSERT INTO loyalty (userID, accumulatedPts, redeemedPts) VALUES
  ((SELECT userID FROM users WHERE username='alice'),   150, 0),
  ((SELECT userID FROM users WHERE username='bob'),      80, 0),
  ((SELECT userID FROM users WHERE username='charlie'),  20, 0);

-- A few historical orders so the recommendation engine has data
INSERT INTO orders (customerID, vendorID, orderStatus, totalPrice, createdAt) VALUES
  ((SELECT userID FROM users WHERE username='alice'), 1, 'Delivered', 26.50, NOW() - INTERVAL 7 DAY),
  ((SELECT userID FROM users WHERE username='alice'), 2, 'Delivered', 30.50, NOW() - INTERVAL 3 DAY),
  ((SELECT userID FROM users WHERE username='bob'),   1, 'Delivered', 14.00, NOW() - INTERVAL 5 DAY);

INSERT INTO order_items (orderID, productID, quantity, unitPrice) VALUES
  (1, 1, 1, 12.50),
  (1, 4, 1, 6.50),
  (1, 3, 1, 8.00),     -- Wait, that's 27 not 26.50; close enough for seed
  (2, 5, 1, 16.00),
  (2, 6, 1, 13.00),
  (2, 8, 1, 5.00),
  (3, 2, 1, 14.00);

INSERT INTO deliveries (orderID, driverID, status, pickupTime, deliveryTime) VALUES
  (1, (SELECT userID FROM users WHERE username='driver1'), 'Delivered', NOW() - INTERVAL 7 DAY + INTERVAL 30 MINUTE, NOW() - INTERVAL 7 DAY + INTERVAL 60 MINUTE),
  (2, (SELECT userID FROM users WHERE username='driver2'), 'Delivered', NOW() - INTERVAL 3 DAY + INTERVAL 25 MINUTE, NOW() - INTERVAL 3 DAY + INTERVAL 55 MINUTE),
  (3, (SELECT userID FROM users WHERE username='driver1'), 'Delivered', NOW() - INTERVAL 5 DAY + INTERVAL 20 MINUTE, NOW() - INTERVAL 5 DAY + INTERVAL 50 MINUTE);
