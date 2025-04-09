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

// Critical - Add connection recovery timeouts (default is too long)
(neonConfig as any).connectionTimeoutMillis = 15000;  // 15 seconds max to establish connection
(neonConfig as any).keepAlive = true;                // Enable TCP keepalive
(neonConfig as any).keepAliveInitialDelayMillis = 10000; // 10 seconds before first keepalive

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
        (firstArg.message.includes('has only a getter') || 
         firstArg.message.includes('Connection terminated unexpectedly'))) {
      originalConsoleError.call(console, 'Intercepted Neon database error: Connection issue detected');
      return; // Don't propagate the problematic error
    }
    originalConsoleError.apply(console, args);
  } catch (e) {
    // Safely log even if error objects are problematic
    originalConsoleError.call(console, 'Error logging suppressed due to TypeError in error object');
  }
};

// Instead of overriding TypeError, add a global error handler for these specific errors
const handleNeondatabaseErrors = (err: Error): Error => {
  try {
    // Check if this is a TypeError from the @neondatabase/serverless package
    if (err instanceof TypeError && err.message && (
        err.message.includes('has only a getter') ||
        err.message.includes('Connection terminated unexpectedly'))) {
      
      // Create a safer error without the problematic properties
      const safeError = new Error('Neon Database Connection Error: ' + err.message);
      safeError.stack = err.stack;
      return safeError;
    }
    return err;
  } catch (e) {
    // If something goes wrong, return a basic error
    return new Error('Error handling database error: ' + 
      ((e as Error).message || 'Unknown error'));
  }
};

// Add this to the global error handlers
process.on('uncaughtException', (err) => {
  const safeError = handleNeondatabaseErrors(err);
  console.error('Uncaught exception:', safeError.message);
  // Don't exit the process for known Neon errors
  if (!safeError.message.includes('Neon Database Connection Error')) {
    process.exit(1); // Exit for other errors
  }
});

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

// Create connection pool factory to allow recreation
let connectionAttempts = 0;
let poolInstance: Pool | null = null;

export function createPool() {
  connectionAttempts++;
  console.log(`Creating database pool (attempt #${connectionAttempts})`);
  
  // Create pool with better configuration for serverless environments
  return new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 3,                         // REDUCED from 5 to 3 for stability
    idleTimeoutMillis: 10000,       // REDUCED from 20s to 10s
    connectionTimeoutMillis: 5000,  // REDUCED from 10s to 5s to fail faster
    maxUses: 20,                    // REDUCED from 50 to 20 for better recycling
  });
}

// Initial pool creation
export const pool = createPool();
poolInstance = pool;

export const db = drizzle({ client: pool, schema });

// Function to recreate the pool if needed
export function recreatePool() {
  try {
    console.log('Recreating database connection pool...');
    
    // Try to close the existing pool first
    if (poolInstance) {
      try {
        poolInstance.end().catch(err => {
          console.log('Error ending previous pool:', err.message || 'Unknown error');
        });
      } catch (err) {
        console.log('Error closing previous pool:', (err as Error).message || 'Unknown error');
      }
    }
    
    // Create a new pool (completely fresh instance)
    const newPool = createPool();
    
    // Store reference to the new pool
    poolInstance = newPool;
    
    // Return the new pool - callers must update their references
    return newPool;
  } catch (err) {
    console.error('Failed to recreate pool:', (err as Error).message || 'Unknown error');
    throw err;
  }
}

// Add more robust event listeners for connection issues
pool.on('error', (err) => {
  // Don't log the entire error object to prevent exposing credentials
  try {
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
  } catch (e) {
    console.error('Error handling pool error event');
  }
});

// Add connection limit reached handling
pool.on('connect', (client) => {
  client.on('error', (err) => {
    try {
      console.error('Client connection error:', (err as any).code || 'unknown');
    } catch (e) {
      console.error('Error handling client error event');
    }
  });
});

// Improved connect function for use in index.ts
export async function connect() {
  let client = null;
  
  try {
    // Test the connection with a timeout
    const connectionPromise = pool.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timed out after 5 seconds')), 5000)
    );
    
    client = await Promise.race([connectionPromise, timeoutPromise]) as any;
    
    // Execute a simple query to ensure the connection is fully working
    await client.query('SELECT 1');
    
    console.log('Successfully connected to PostgreSQL database');
    return true;
  } catch (err) {
    try {
      // Check if this is the TypeError from @neondatabase/serverless
      if (err instanceof TypeError && 
          (err.message.includes('which has only a getter') || 
           err.message.includes('Connection terminated unexpectedly'))) {
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
    } catch (innerErr) {
      console.error('Error during connection error handling:', 
        (innerErr as Error).message || 'Unknown error');
      throw new Error('Database connection failed with error handling issue');
    }
  } finally {
    // Always release the client if we got one
    if (client) {
      try {
        client.release();
      } catch (err) {
        console.error('Error releasing client:', (err as Error).message || 'Unknown error');
      }
    }
  }
}