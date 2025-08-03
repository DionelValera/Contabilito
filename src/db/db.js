// src/db/db.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export async function initializeDatabase() {
  const db = await open({
    filename: './src/db/ingreso.db',
    driver: sqlite3.Database,
  });

  // --- CREACIÓN DE TABLAS (TODAS CON IF NOT EXISTS PARA PERSISTENCIA) ---
  // Las tablas solo se crearán si no existen. Los datos persistirán a través de los reinicios del servidor.
  // Si necesitas resetear la base de datos, deberás eliminar manualmente el archivo 'ingreso.db'.

  // Tabla 'users'
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      terms_accepted INTEGER NOT NULL CHECK(terms_accepted IN (0, 1)),
      reset_token TEXT,
      reset_token_expires_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  //Tabla UserSettings
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    email_notifications INTEGER DEFAULT 0,
    in_app_notifications INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  
  // Tabla 'companies'
  await db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL UNIQUE,
      owner_user_id INTEGER NOT NULL,
      industry TEXT,
      address TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Tabla 'user_company_roles'
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_company_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'accountant', 'member')),
      created_at TEXT NOT NULL,
      UNIQUE(user_id, company_id), -- Un usuario solo puede tener un rol por empresa
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);

  // Tabla 'accounts'
  await db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      account_name TEXT NOT NULL,
      initial_balance REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, account_name), -- Nombre de cuenta único por empresa
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);

  // Tabla 'transactions'
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL, 
      user_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL, 
      type TEXT NOT NULL CHECK(type IN ('ingreso', 'gasto')),
      amount REAL NOT NULL,
      description TEXT,
      category TEXT,
      transaction_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);

  // --- FIN CREACIÓN DE TABLAS ---

  return db;
}
