CREATE TABLE IF NOT EXISTS users(
    username VARCHAR(50) PRIMARY KEY,
    password CHAR(60) NOT NULL
    location VARCHAR(50) NOT NULL,
);