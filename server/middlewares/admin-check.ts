import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to check if a user has admin role
 * This middleware should be used after authentication middleware
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  // First check if user is authenticated at all
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Then check if user has admin role
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden - Admin access required' });
  }
  
  // If we get here, the user is an admin, so continue
  next();
}