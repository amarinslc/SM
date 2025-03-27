import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Set WebSocket constructor for Neon serverless
neonConfig.webSocketConstructor = ws;

// Fix SSL configuration based on error logs
neonConfig.pipelineConnect = false;       // Disable pipelineConnect for stability
neonConfig.useSecureWebSocket = true;     // Secure connection
neonConfig.forceDisablePgSSL = true;      // Disable Postgres SSL as we're using WebSocket SSL

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create pool with better configuration for serverless environments
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10,                         // Maximum 10 connections in pool
  idleTimeoutMillis: 30000,        // Close idle connections after 30s
  connectionTimeoutMillis: 30000,  // Connection timeout after 30s
  maxUses: 100,                    // Recycle connection after 100 uses
});

export const db = drizzle({ client: pool, schema });

// Add more robust event listeners for connection issues
pool.on('error', (err) => {
  console.error('Database pool error:', err);
  // Don't exit the process immediately, let reconnection happen
  const errorCode = (err as any).code;
  if (errorCode === '57P01') {
    console.log('Connection terminated by administrator, will automatically reconnect');
  } else if (errorCode === 'ECONNRESET' || errorCode === 'EPIPE') {
    console.log('Connection reset, will automatically reconnect');
  } else {
    console.error('Unexpected database error:', err);
  }
});

// Improved connect function for use in index.ts
export async function connect() {
  try {
    // Test the connection
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL database');
    client.release(); // Important: release the client back to the pool
    return true;
  } catch (err) {
    console.error('Failed to connect to PostgreSQL database:', err);
    throw err;
  }
}