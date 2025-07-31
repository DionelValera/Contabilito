// src/pages/api/auth/login.js
// This endpoint handles user login requests.

import { initializeDatabase } from '../../db/db.js'; // Adjust path as needed
import bcrypt from 'bcrypt'; // For comparing hashed passwords

export async function POST({ request }) {
  try {
    const db = await initializeDatabase(); // Connect to the database

    const { identifier, password } = await request.json(); // Get data from the form

    // Basic validation for required fields
    if (!identifier || !password) {
      return new Response(JSON.stringify({ message: 'User/Email and password are required.' }), {
        status: 400, // Bad Request
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Search for the user by email OR username (case-insensitive search)
    const user = await db.get(
      `SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)`,
      identifier,
      identifier
    );

    if (!user) {
      // User not found
      return new Response(JSON.stringify({ message: 'Invalid credentials.' }), {
        status: 401, // Unauthorized
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Compare the provided password with the hashed password from the database
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      // Incorrect password
      return new Response(JSON.stringify({ message: 'Invalid credentials.' }), {
        status: 401, // Unauthorized
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If credentials are valid:
    // Here you would typically generate a session token (e.g., JWT)
    // and send it back to the client for subsequent authenticated requests.
    // For now, we return a success message and basic user data.
    const userResponse = {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      // companyName is no longer directly in the users table,
      // you'd fetch user's companies/roles separately if needed for the response.
    };

    return new Response(JSON.stringify({ message: 'Login successful.', user: userResponse }), {
      status: 200, // OK
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in login endpoint:', error);
    return new Response(JSON.stringify({ message: 'Internal server error during login.' }), {
      status: 500, // Internal Server Error
      headers: { 'Content-Type': 'application/json' },
    });
  }
}