-- AgriMovers MySQL schema (compatible with server.js queries)

CREATE DATABASE IF NOT EXISTS `agrimovers3` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `agrimovers3`;

-- users
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `fullname` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('farmer','transporter','admin') NOT NULL DEFAULT 'farmer',
  `vehicle_size` VARCHAR(64),
  `availability` TINYINT(1) DEFAULT 0,
  `lat` DOUBLE,
  `lng` DOUBLE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- transport_requests
CREATE TABLE IF NOT EXISTS `transport_requests` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `farmer_id` INT NOT NULL,
  `farmer_name` VARCHAR(255),
  `transporter_name` VARCHAR(255),
  `transporter_id` INT,
  `produce` VARCHAR(255),
  `quantity` VARCHAR(255),
  `pickup_time` VARCHAR(255),
  `pickup_location` VARCHAR(255),
  `destination` VARCHAR(255),
  `vehicleType` VARCHAR(128),
  `status` VARCHAR(64) DEFAULT 'Pending',
  `paid` TINYINT(1) DEFAULT 0,
  `payment_screenshot` VARCHAR(255),
  `distance_km` DECIMAL(8,2),
  `agreed_price` DECIMAL(10,2),
  `status_en_route_at` TIMESTAMP NULL,
  `status_picked_at` TIMESTAMP NULL,
  `status_delivered_at` TIMESTAMP NULL,
  `current_lat` DOUBLE NULL,
  `current_lng` DOUBLE NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `farmer_idx` (`farmer_id`),
  CONSTRAINT `fk_request_farmer` FOREIGN KEY (`farmer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `UserID` INT NOT NULL,
  `Message` TEXT,
  `CreatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_idx` (`UserID`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`UserID`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- offers
CREATE TABLE IF NOT EXISTS `offers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `transporter_id` INT NOT NULL,
  `transporter_name` VARCHAR(255),
  `price` DECIMAL(10,2) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `request_idx` (`request_id`),
  KEY `transporter_idx` (`transporter_id`),
  CONSTRAINT `fk_offers_request` FOREIGN KEY (`request_id`) REFERENCES `transport_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_offers_transporter` FOREIGN KEY (`transporter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- transporter_rates
CREATE TABLE IF NOT EXISTS `transporter_rates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `transporter_id` INT NOT NULL,
  `vehicle_type` VARCHAR(128) NOT NULL,
  `rate_per_km` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transporter_vehicle_unique` (`transporter_id`,`vehicle_type`),
  CONSTRAINT `fk_rates_transporter` FOREIGN KEY (`transporter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ratings
CREATE TABLE IF NOT EXISTS `ratings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `request_id` INT NOT NULL,
  `rater_id` INT NOT NULL,
  `rated_user_id` INT NOT NULL,
  `rating` INT NOT NULL,
  `comment` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ratings_request` FOREIGN KEY (`request_id`) REFERENCES `transport_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ratings_rater` FOREIGN KEY (`rater_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ratings_rated` FOREIGN KEY (`rated_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional: insert a sample admin user (use the web UI /register to create users so password is hashed by the server)
-- INSERT INTO users (fullname, email, password, role) VALUES ('Admin User', 'admin@example.com', '<bcrypt-hash-here>', 'admin');
