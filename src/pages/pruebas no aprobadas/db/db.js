// src/db/db.js
// This file centralizes database initialization and schema definition for Contabilito.

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

/**
 * Initializes the SQLite database connection and ensures all necessary tables exist.
 * This function is idempotent: it will only create tables if they don't already exist.
 * It also defines the schema for users, companies, user roles, transactions, and collaboration requests.
 * @returns {Promise<import('sqlite').Database>} A promise that resolves with the database instance.
 */
export async function initializeDatabase() {
  const db = await open({
    filename: './src/db/ingreso.db', // Path to your database file
    driver: sqlite3.Database,
  });

  // 1. Create 'users' table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      reset_token TEXT,
      reset_token_expires_at TEXT,
      terms_accepted INTEGER NOT NULL CHECK(terms_accepted IN (0, 1))
    );
  `);

  // 2. Create 'companies' table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL UNIQUE,
      owner_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      industry TEXT,
      address TEXT,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 3. Create 'user_company_roles' table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_company_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'accountant', 'viewer')),
      created_at TEXT NOT NULL,
      UNIQUE(user_id, company_id), -- Ensures a user has only one role per company
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);

  // 4. Create 'transactions' table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL, -- User who recorded the transaction (for audit)
      type TEXT NOT NULL CHECK(type IN ('ingreso', 'gasto')),
      amount REAL NOT NULL,
      description TEXT,
      category TEXT,
      transaction_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 5. Create 'collaboration_requests' table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS collaboration_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requesting_user_id INTEGER NOT NULL,
      target_company_id INTEGER NOT NULL,
      requested_role TEXT NOT NULL CHECK(requested_role IN ('admin', 'accountant', 'viewer')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected')),
      created_at TEXT NOT NULL,
      responded_at TEXT,
      responded_by_user_id INTEGER,
      FOREIGN KEY (requesting_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (target_company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (responded_by_user_id) REFERENCES users(id) ON DELETE SET NULL -- SET NULL if responder user is deleted
    );
  `);

  return db;
}