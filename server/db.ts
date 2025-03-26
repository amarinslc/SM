import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket for Neon serverless driver
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Create connection pool with proper configuration
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  maxRetries: 5,
  retryDelay: 2000, // 2 seconds between retries
  connectionTimeoutMillis: 10000, // 10 second timeout
});

// Add event listeners for connection issues
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Export connect function for use in index.ts
export async function connect() {
  try {
    await pool.connect();
    console.log('Successfully connected to PostgreSQL database');
  } catch (err) {
    console.error('Failed to connect to PostgreSQL database:', err);
    throw err;
  }
}