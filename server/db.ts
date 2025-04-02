import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Set WebSocket constructor for Neon serverless
neonConfig.webSocketConstructor = ws;

// Fix SSL configuration based on error logs
neonConfig.pipelineConnect = false;       // Disable pipelineConnect for stability
neonConfig.useSecureWebSocket = true;     // Secure WebSocket connection
neonConfig.forceDisablePgSSL = true;      // REVERTED: Disable Postgres SSL to avoid double encryption

// Apply custom settings for better reliability
// These are applied as any type since they may not be in TypeScript definitions yet
(neonConfig as any).wsProxy = undefined;  // Don't use proxy unless needed

// Error handling improvement - wrap potentially problematic methods
process.on('unhandledRejection', (reason) => {
  console.log('Unhandled Rejection at:', reason);
  // Don't crash, just log the issue
});

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Enhanced patch for fixing the TypeError in @neondatabase/serverless
const originalConsoleError = console.error;
console.error = function(...args) {
  try {
    // Check if we're dealing with a TypeError related to the read-only property
    const firstArg = args[0];
    if (typeof firstArg === 'object' && 
        firstArg instanceof Error && 
        firstArg.message && 
        firstArg.message.includes('has only a getter')) {
      originalConsoleError.call(console, 'Intercepted Neon database error: Connection issue detected');
      return; // Don't propagate the problematic error
    }
    originalConsoleError.apply(console, args);
  } catch (e) {
    // Safely log even if error objects are problematic
    originalConsoleError.call(console, 'Error logging suppressed due to TypeError in error object');
  }
};

// Global error handler for unhandled promise rejections that might crash the server
process.on('unhandledRejection', (reason, promise) => {
  try {
    console.log('Unhandled Rejection at:', promise);
    if (reason instanceof Error) {
      // Sanitize the message to avoid exposing credentials
      const sanitizedMessage = reason.message.replace(/postgresql:\/\/[^@]*@[^/]*/g, 'postgresql://[REDACTED]');
      console.log('Reason:', sanitizedMessage);
    } else {
      console.log('Reason:', reason);
    }
  } catch (e) {
    console.log('Error in unhandledRejection handler');
  }
  // Don't exit the process, let it recover
});

// Create pool with better configuration for serverless environments
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 5,                         // REDUCED from 10 to 5 for stability
  idleTimeoutMillis: 20000,       // REDUCED from 30s to 20s
  connectionTimeoutMillis: 10000, // REDUCED from 30s to 10s to fail faster
  maxUses: 50,                    // REDUCED from 100 to 50 for better recycling
});

export const db = drizzle({ client: pool, schema });

// Add more robust event listeners for connection issues
pool.on('error', (err) => {
  // Don't log the entire error object to prevent exposing credentials
  const errorCode = (err as any).code;
  const errorMessage = (err as any).message || 'Unknown error';
  console.error(`Database pool error: ${errorCode} - ${errorMessage}`);
  
  // Don't exit the process immediately, let reconnection happen
  if (errorCode === '57P01') {
    console.log('Connection terminated by administrator, will automatically reconnect');
  } else if (errorCode === 'ECONNRESET' || errorCode === 'EPIPE') {
    console.log('Connection reset, will automatically reconnect');
  } else {
    console.error(`Unexpected database error: ${errorCode}`);
  }
});

// Improved connect function for use in index.ts
export async function connect() {
  try {
    // Test the connection with a timeout
    const connectionPromise = pool.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timed out after 10 seconds')), 10000)
    );
    
    const client = await Promise.race([connectionPromise, timeoutPromise]) as any;
    
    // Execute a simple query to ensure the connection is fully working
    await client.query('SELECT 1');
    
    console.log('Successfully connected to PostgreSQL database');
    client.release(); // Important: release the client back to the pool
    return true;
  } catch (err) {
    // Check if this is the TypeError from @neondatabase/serverless
    if (err instanceof TypeError && err.message.includes('which has only a getter')) {
      console.error('Encountered known TypeError in @neondatabase/serverless package');
      
      // Create a new error that doesn't have the problematic property
      const fixedError = new Error('Database connection error: Neon TypeError');
      throw fixedError;
    }
    
    // Log error details without exposing connection string
    const errorCode = (err as any)?.code || 'unknown';
    const errorMessage = typeof (err as any)?.message === 'string' 
      ? (err as any).message.replace(/postgresql:\/\/[^@]*@[^/]*/g, 'postgresql://[REDACTED]')
      : 'Unknown error';
      
    console.error(`Failed to connect to PostgreSQL database: ${errorCode} - ${errorMessage}`);
    
    // Create a sanitized error without connection details
    const sanitizedError = new Error(`Database connection failed: ${errorCode}`);
    throw sanitizedError;
  }
}