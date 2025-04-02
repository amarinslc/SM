import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool, connect } from "./db";
import path from "path";
import fs from "fs/promises";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists with proper permissions
const uploadsDir = path.join(process.cwd(), 'uploads');
try {
  await fs.access(uploadsDir);
} catch {
  await fs.mkdir(uploadsDir, { recursive: true, mode: 0o755 });
}

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Add request logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

// Database connection with retries and keep-alive
const MAX_RETRIES = 7;         // Increased from 5 to 7 for more retries
const RETRY_DELAY = 3000;      // Decreased from 5000 to 3000 for faster retries
const HEALTH_CHECK_INTERVAL = 15000; // Decreased from 30s to 15s for more frequent health checks

let isShuttingDown = false;
let healthCheckTimer: NodeJS.Timeout | null = null;

async function connectWithRetry(retries: number = MAX_RETRIES): Promise<void> {
  try {
    await connect();
    setupHealthCheck();
  } catch (error) {
    console.error("Database connection error:", error);
    if (retries > 0) {
      log(`Retrying database connection in ${RETRY_DELAY/1000} seconds... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      await connectWithRetry(retries - 1);
    } else {
      throw new Error("Failed to connect to database after multiple attempts");
    }
  }
}

function setupHealthCheck() {
  // Clear any existing health check timer
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }

  // Set up a periodic health check to keep the connection alive
  healthCheckTimer = setInterval(async () => {
    if (isShuttingDown) return;
    
    try {
      // Get a client from the pool and execute a simple query
      const client = await pool.connect();
      try {
        await client.query('SELECT 1'); // Simple query to check connection
        console.log("Database health check: OK");
      } catch (err) {
        try {
          // Log only essential error info to avoid exposing credentials
          const errorCode = (err as any).code;
          let errorMessage = 'Unknown error';
          
          // Safely extract error message to prevent TypeError
          try {
            if (typeof (err as any).message === 'string') {
              errorMessage = (err as any).message;
            }
          } catch (messageErr) {
            console.error('Error accessing error message property');
          }
          
          console.error(`Database health check failed: ${errorCode} - ${errorMessage}`);
          
          // If we get specific error codes that indicate severe connection issues, attempt recovery
          if (errorCode === '57P01' || errorCode === 'ECONNRESET' || errorCode === 'EPIPE') {
            console.log('Attempting database connection recovery...');
            try {
              // Clear health check timer as we're about to restart it
              if (healthCheckTimer) {
                clearInterval(healthCheckTimer);
                healthCheckTimer = null;
              }
              
              // Close the current pool which may be in a bad state
              await pool.end().catch(e => {
                try {
                  console.log('Error ending pool:', e.message);
                } catch {
                  console.log('Error ending pool: [Error accessing error object]');
                }
              });
              
              // Recreate the pool (this happens in the db.ts module)
              await connectWithRetry(3); // Retry up to 3 times
              console.log('Database connection recovered successfully');
              return; // Exit the health check as a new one will be setup by connectWithRetry
            } catch (recoveryErr) {
              try {
                console.error('Failed to recover database connection:', 
                  (recoveryErr as any)?.message || 'Unknown error');
              } catch {
                console.error('Failed to recover database connection: [Error accessing error object]');
              }
            }
          }
        } catch (handlingErr) {
          // Extra safety net in case error handling itself fails
          console.error('Error while handling database check error');
        }
      } finally {
        try {
          client.release(); // Always release the client
        } catch (releaseErr) {
          console.error('Error releasing client');
        }
      }
    } catch (err) {
      try {
        // Handle the @neondatabase/serverless TypeError
        if (err instanceof TypeError && err.toString().includes('has only a getter')) {
          console.error('Caught TypeError in health check (Neon database connection issue)');
          
          // Trigger reconnection without trying to access the error object
          console.log('Attempting database connection recovery due to TypeError...');
          
          try {
            // Clear health check timer as we're about to restart it
            if (healthCheckTimer) {
              clearInterval(healthCheckTimer);
              healthCheckTimer = null;
            }
            
            // Recreate the pool (this happens in the db.ts module)
            await connectWithRetry(3); // Retry up to 3 times
            console.log('Database connection recovered successfully after TypeError');
            return; // Exit the health check as a new one will be setup by connectWithRetry
          } catch (recoveryErr) {
            console.error('Failed to recover database connection after TypeError');
          }
          return;
        }
        
        // Log only essential error info to avoid exposing credentials
        let errorCode = 'unknown';
        let errorMessage = 'Unknown error';
        
        try {
          errorCode = (err as any)?.code || 'unknown';
          if (typeof (err as any)?.message === 'string') {
            errorMessage = (err as any).message;
          }
        } catch (propErr) {
          console.error('Error accessing error properties');
        }
        
        console.error(`Failed to get client for health check: ${errorCode} - ${errorMessage}`);
      } catch (handlingErr) {
        // Last resort error handling
        console.error('Error while handling client connection error');
      }
    }
  }, HEALTH_CHECK_INTERVAL);
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing database pool...');
  await gracefulShutdown();
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Closing database pool...');
  await gracefulShutdown();
});

async function gracefulShutdown() {
  isShuttingDown = true;
  
  // Clear health check timer
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  
  try {
    // Close pool with timeout
    const poolClosePromise = pool.end();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Pool close timed out')), 5000)
    );
    
    await Promise.race([poolClosePromise, timeoutPromise]);
    console.log('Database pool closed successfully');
  } catch (err) {
    // Log only essential error info to avoid exposing credentials
    const errorMessage = (err as any).message || 'Unknown error';
    console.error(`Error closing database pool: ${errorMessage}`);
  }
  
  process.exit(0);
}

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Sanitize error output to avoid exposing sensitive information
  const errorCode = err.code || 'Unknown';
  const errorMessage = err.message || "Internal Server Error";
  console.error(`Server error: ${errorCode} - ${errorMessage}`);
  
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: errorMessage });
});

(async () => {
  try {
    // Ensure database connection is ready
    await connectWithRetry();

    const server = await registerRoutes(app);

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Use deployment port or fallback to 5000
    const port = process.env.PORT || 5000;
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`Server running on http://0.0.0.0:${port}`);
    });
  } catch (error) {
    // Sanitize error output to avoid exposing credentials
    const errorMessage = (error as any).message || 'Unknown error';
    console.error('Failed to start server:', errorMessage);
    process.exit(1);
  }
})();