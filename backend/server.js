const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const saltRounds = 10;

// Conexión a la base de datos
const db = new sqlite3.Database('./database.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Error al conectar con la base de datos:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
        db.exec(`
        -- Tabla de usuarios
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            company_id INTEGER,
            terms_accepted INTEGER NOT NULL CHECK(terms_accepted IN (0, 1)),
                                          reset_token TEXT,
                                          reset_token_expires_at TEXT,
                                          created_at TEXT NOT NULL,
                                          deleted_at TEXT,
                                          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
        );

        -- Tabla de configuraciones de usuario
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            email_notifications INTEGER DEFAULT 0,
            in_app_notifications INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Tabla de empresas
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL UNIQUE,
            owner_user_id INTEGER,
            industry TEXT,
            address TEXT,
            created_at TEXT NOT NULL,
            deleted_at TEXT,
            FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        -- Tabla de roles de usuarios en empresas
        CREATE TABLE IF NOT EXISTS user_company_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            company_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'accountant', 'member')),
                                                       created_at TEXT NOT NULL,
                                                       UNIQUE(user_id, company_id),
                                                       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                                       FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        );

        -- Tablas restantes (cuentas, categorías, transacciones)
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            account_name TEXT NOT NULL,
            initial_balance REAL NOT NULL DEFAULT 0.0,
            created_at TEXT NOT NULL,
            deleted_at TEXT,
            UNIQUE(company_id, account_name),
                                             FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            category_name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('ingreso', 'gasto')),
                                               created_at TEXT NOT NULL,
                                               deleted_at TEXT,
                                               UNIQUE(company_id, category_name),
                                               FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('ingreso', 'gasto')),
                                                 amount REAL NOT NULL,
                                                 description TEXT,
                                                 category_id INTEGER,
                                                 transaction_date TEXT NOT NULL,
                                                 created_at TEXT NOT NULL,
                                                 deleted_at TEXT,
                                                 FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                                                 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                                                 FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                                                 FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        );
        `, (err) => {
            if (err) {
                console.error('Error al crear las tablas:', err.message);
            } else {
                console.log('Tablas verificadas y/o creadas correctamente.');
            }
        });
    }
});

// Rutas del API
app.post('/register', async (req, res) => {
    // Agregamos company_name a los datos recibidos del body.
    const { first_name, last_name, username, email, password, terms_accepted, company_name } = req.body;

    // Validación de campos obligatorios (sin terms_accepted)
    if (!first_name || !last_name || !username || !email || !password) {
        return res.status(400).json({ message: 'Todos los campos obligatorios deben ser completados.' });
    }

    // Eliminamos la validación de terms_accepted, ya que el frontend se encarga de eso.
    // Esto previene que un valor incorrecto (como 'on') cause un error 400.

    try {
        // Validación de existencia de usuario o email
        const userExists = await new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE username = ? OR email = ?`, [username, email], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (userExists) {
            return res.status(409).json({ message: 'El nombre de usuario o email ya están en uso.' });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const createdAt = new Date().toISOString();

        let companyId = null;

        // Lógica para la empresa (solo si se proporciona un nombre de empresa)
        if (company_name && company_name.trim() !== '') {
            // 1. Verificamos si la compañía ya existe
            const companyExists = await new Promise((resolve, reject) => {
                db.get(`SELECT id FROM companies WHERE company_name = ?`, [company_name.trim()], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });

            if (companyExists) {
                return res.status(409).json({ message: `El nombre de empresa '${company_name}' ya está en uso.` });
            }

            // 2. Insertamos la nueva compañía
            companyId = await new Promise((resolve, reject) => {
                db.run(`INSERT INTO companies (company_name, created_at) VALUES (?, ?)`,
                       [company_name.trim(), createdAt],
                       function (err) {
                           if (err) reject(err);
                           resolve(this.lastID);
                       });
            });
        }

        // Insertamos el nuevo usuario en la base de datos
        // Ahora terms_accepted es un valor que se inserta sin validación.
        const termsAcceptedInt = terms_accepted === true || terms_accepted === 1 ? 1 : 0;
        db.run(`INSERT INTO users (first_name, last_name, username, email, password_hash, terms_accepted, company_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
               [first_name, last_name, username, email, hashedPassword, termsAcceptedInt, companyId, createdAt],
               function (err) {
                   if (err) {
                       console.error('Error al insertar usuario:', err);
                       return res.status(500).json({ message: 'Error interno del servidor al registrar.' });
                   }
                   const newUserId = this.lastID;
                   console.log(`Usuario ${username} registrado con el ID: ${newUserId}`);

                   // Lógica para el rol y owner de la empresa (si se creó una empresa)
                   if (companyId) {
                       db.run(`INSERT INTO user_company_roles (user_id, company_id, role, created_at) VALUES (?, ?, 'owner', ?)`,
                              [newUserId, companyId, createdAt],
                              (err) => {
                                  if (err) {
                                      console.error('Error al asignar rol de propietario:', err);
                                  } else {
                                      console.log(`Rol 'owner' asignado al usuario ${newUserId} para la compañía ${companyId}.`);
                                  }
                              }
                       );

                       db.run(`UPDATE companies SET owner_user_id = ? WHERE id = ?`, [newUserId, companyId], (err) => {
                           if (err) {
                               console.error('Error al actualizar owner de la compañía:', err);
                           } else {
                               console.log(`Owner de la compañía ${companyId} actualizado a ${newUserId}.`);
                           }
                       });
                   }

                   return res.status(201).json({ message: '¡Registro exitoso! Ahora puedes iniciar sesión.' });
               }
        );

    } catch (error) {
        console.error('Error en el proceso de registro:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


// Ruta para manejar el login de usuarios
app.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ message: 'El usuario/correo y la contraseña son obligatorios.' });
    }

    try {
        const user = await new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE username = ? OR email = ?`, [identifier, identifier], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (!user) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // Login exitoso, enviamos el company_id
        res.status(200).json({
            message: '¡Login exitoso!',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                company_id: user.company_id
            }
        });

    } catch (error) {
        console.error('Error en el proceso de login:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});
// Nueva ruta para obtener los datos del dashboard
app.get('/dashboard-data/:companyId', async (req, res) => {
    const { companyId } = req.params;

    try {
        // Obtenemos los saldos de todas las cuentas de la compañía
        const totalBalance = await new Promise((resolve, reject) => {
            db.get(`SELECT SUM(initial_balance) AS total FROM accounts WHERE company_id = ? AND deleted_at IS NULL`, [companyId], (err, row) => {
                if (err) reject(err);
                resolve(row ? row.total : 0);
            });
        });

        // Simulamos datos de presupuesto e inversiones para el dashboard.
        // En un sistema real, esto se obtendría de tablas específicas.
        const simulatedBudget = 16050; // Valor estático por ahora
        const simulatedInvestments = 70843; // Valor estático por ahora

        // Obtenemos las últimas 5 transacciones de la compañía
        const latestTransactions = await new Promise((resolve, reject) => {
            db.all(`SELECT id, amount, description, type, transaction_date FROM transactions WHERE company_id = ? AND deleted_at IS NULL ORDER BY transaction_date DESC LIMIT 5`, [companyId], (err, rows) => {
                if (err) reject(err);
                resolve(rows || []);
            });
        });

        res.status(200).json({
            message: 'Datos del dashboard obtenidos con éxito',
            data: {
                totalBalance: totalBalance || 0,
                budget: simulatedBudget,
                investments: simulatedInvestments,
                transactions: latestTransactions
            }
        });

    } catch (error) {
        console.error('Error al obtener datos del dashboard:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});
