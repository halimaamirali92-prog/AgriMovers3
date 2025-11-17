-- Schema for AgriMovers prototype
-- Create database and tables. Run in MySQL client or Workbench.

CREATE DATABASE IF NOT EXISTS agrimovers3 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agrimovers3;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fullname VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('farmer','transporter','admin') DEFAULT 'farmer',
  vehicle_size VARCHAR(100) DEFAULT NULL,
  availability TINYINT(1) DEFAULT 0,
  lat DOUBLE DEFAULT NULL,
  lng DOUBLE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transport requests
CREATE TABLE IF NOT EXISTS transport_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  farmer_id INT NOT NULL,
  farmer_name VARCHAR(255),
  transporter_name VARCHAR(255),
  transporter_id INT DEFAULT NULL,
  produce VARCHAR(255),
  quantity VARCHAR(100),
  pickup_time VARCHAR(100),
  pickup_location VARCHAR(255),
  destination VARCHAR(255),
  vehicleType VARCHAR(100),
  status VARCHAR(50) DEFAULT 'Pending',
  paid TINYINT(1) DEFAULT 0,
  payment_screenshot VARCHAR(255) DEFAULT NULL,
  distance_km DECIMAL(8,2) DEFAULT NULL,
  agreed_price DECIMAL(10,2) DEFAULT NULL,
  status_en_route_at TIMESTAMP NULL DEFAULT NULL,
  status_picked_at TIMESTAMP NULL DEFAULT NULL,
  status_delivered_at TIMESTAMP NULL DEFAULT NULL,
  current_lat DOUBLE DEFAULT NULL,
  current_lng DOUBLE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notifications simple table
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  UserID INT NOT NULL,
  Message TEXT,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (UserID) REFERENCES users(id) ON DELETE CASCADE
);

-- Offers table: transporters can propose prices for a transport request
CREATE TABLE IF NOT EXISTS offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  transporter_id INT NOT NULL,
  transporter_name VARCHAR(255),
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES transport_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (transporter_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Ratings table for post-delivery reviews
CREATE TABLE IF NOT EXISTS ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  rater_id INT NOT NULL,
  rated_user_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES transport_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (rater_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (rated_user_id) REFERENCES users(id) ON DELETE CASCADE
);
