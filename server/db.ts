import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket for Neon serverless driver
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Create connection pool
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Test the connection
pool.connect().then(() => {
  console.log('Successfully connected to PostgreSQL database');
}).catch(err => {
  console.error('Failed to connect to PostgreSQL database:', err);
  process.exit(1);
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });