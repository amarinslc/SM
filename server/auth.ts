import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "dunbar-secret",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      console.log(`Login attempt for username: ${username}`);
      const user = await storage.getUserByUsername(username);
      console.log(`User found:`, user ? 'yes' : 'no');

      if (!user) {
        console.log('Login failed: User not found');
        return done(null, false);
      }

      const passwordValid = await comparePasswords(password, user.password);
      console.log(`Password valid: ${passwordValid}`);

      if (!passwordValid) {
        console.log('Login failed: Invalid password');
        return done(null, false);
      }

      console.log('Login successful');
      return done(null, user);
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    console.log("Login successful, sending response");
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Check for existing username
      const existingUsername = await storage.getUserByUsername(req.body.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check for existing email
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      // Send verification email
      await storage.sendVerificationEmail(user.id, user.email);

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({ 
          ...user,
          message: "Please check your email to verify your account" 
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/verify-email/:token", async (req, res) => {
    try {
      const verified = await storage.verifyEmail(req.params.token);
      if (verified) {
        res.json({ message: "Email verified successfully" });
      } else {
        res.status(400).json({ message: "Invalid or expired verification token" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to verify email" });
    }
  });


  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const isVerified = await storage.isEmailVerified(req.user!.id);
    res.json({
      ...req.user,
      emailVerified: isVerified
    });
  });
}