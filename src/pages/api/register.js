// src/pages/api/register.js
// This endpoint handles user registration requests, including optional company creation.

import { initializeDatabase } from '../../db/db.js'; // Adjust path as needed
import bcrypt from 'bcrypt';

export async function POST({ request }) {
  try {
    const db = await initializeDatabase(); // Connect to the database

    const { 
      firstName, 
      lastName, 
      username, 
      companyName, // This is now optional and triggers company creation
      email, 
      password, 
      termsAccepted 
    } = await request.json();

    // Server-side validation for required user fields
    if (!firstName || !lastName || !username || !email || !password || termsAccepted === undefined) {
      return new Response(JSON.stringify({ message: 'All required user fields must be completed.' }), {
        status: 400, // Bad Request
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (password.length < 6) {
        return new Response(JSON.stringify({ message: 'Password must be at least 6 characters long.' }), {
            status: 400, // Bad Request
            headers: { 'Content-Type': 'application/json' },
        });
    }
    if (!termsAccepted) {
        return new Response(JSON.stringify({ message: 'You must accept the Terms and Conditions.' }), {
            status: 400, // Bad Request
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    let userId;
    let companyId = null; // Initialize companyId to null

    try {
      // Start a transaction for atomicity (if creating user and company)
      await db.run('BEGIN TRANSACTION');

      // 1. Insert the new user into the 'users' table
      const userResult = await db.run(
        `INSERT INTO users 
          (first_name, last_name, username, email, password, terms_accepted, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        firstName,
        lastName,
        username,
        email,
        hashedPassword,
        termsAccepted,
        createdAt
      );
      userId = userResult.lastID; // Get the ID of the newly created user

      // 2. If companyName is provided, create a new company and assign owner role
      if (companyName && companyName.trim() !== '') {
        // Check if company name already exists to prevent duplicates
        const existingCompany = await db.get('SELECT id FROM companies WHERE LOWER(company_name) = LOWER(?)', companyName);
        if (existingCompany) {
            await db.run('ROLLBACK'); // Rollback user creation if company name exists
            return new Response(JSON.stringify({ message: 'A company with this name already exists.' }), {
                status: 409, // Conflict
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const companyResult = await db.run(
          `INSERT INTO companies 
            (company_name, owner_user_id, created_at) 
           VALUES (?, ?, ?)`,
          companyName.trim(),
          userId,
          createdAt
        );
        companyId = companyResult.lastID; // Get the ID of the newly created company

        // Assign 'owner' role to the user for this new company
        await db.run(
          `INSERT INTO user_company_roles 
            (user_id, company_id, role, created_at) 
           VALUES (?, ?, ?, ?)`,
          userId,
          companyId,
          'owner', // Assign 'owner' role to the user who created the company
          createdAt
        );
      }

      await db.run('COMMIT'); // Commit the transaction

      return new Response(JSON.stringify({ 
        message: 'User registered successfully' + (companyId ? ' and company created.' : '.'), 
        userId: userId,
        companyId: companyId 
      }), {
        status: 201, // Created
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (dbError) {
      await db.run('ROLLBACK'); // Rollback on any database error
      // Handle UNIQUE constraint errors for email or username
      if (dbError.message.includes('SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email')) {
        return new Response(JSON.stringify({ message: 'This email is already registered.' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (dbError.message.includes('SQLITE_CONSTRAINT: UNIQUE constraint failed: users.username')) {
        return new Response(JSON.stringify({ message: 'This username is already in use.' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Other database errors
      console.error('Error inserting user/company into DB:', dbError);
      return new Response(JSON.stringify({ message: 'Error registering user/company in the database.' }), {
        status: 500, // Internal Server Error
        headers: { 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('General error in registration endpoint:', error);
    return new Response(JSON.stringify({ message: 'Internal server error during registration.' }), {
      status: 500, // Internal Server Error
      headers: { 'Content-Type': 'application/json' },
    });
  }
}