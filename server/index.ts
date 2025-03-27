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
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

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
        console.error("Database health check failed:", err);
      } finally {
        client.release(); // Always release the client
      }
    } catch (err) {
      console.error("Failed to get client for health check:", err);
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
    console.error('Error closing database pool:', err);
  }
  
  process.exit(0);
}

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
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
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();