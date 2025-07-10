import { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import User from '../models/User';

// User type is now defined in src/types/express.d.ts

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    // Find user in our database
    const user = await User.findOne({ clerkId: userId });

    if (!user) {
      res.status(401).json({
        error: 'User not found',
        message: 'Please complete your profile setup'
      });
      return;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    (req as any).user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Authentication error',
      message: 'Failed to authenticate user'
    });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    console.log('🔐 Role check - Required roles:', roles);
    const reqUser = (req as any).user;
    console.log('👤 User:', reqUser ? { id: reqUser.clerkId, email: reqUser.email, role: reqUser.role } : 'No user');

    if (!reqUser) {
      console.log('❌ No user found in request');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    if (!reqUser.role || !roles.includes(reqUser.role)) {
      console.log(`❌ Role check failed - User role: ${reqUser.role}, Required: ${roles.join(', ')}`);
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
      return;
    }

    console.log('✅ Role check passed');
    next();
  };
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = getAuth(req);

    if (userId) {
      const user = await User.findOne({ clerkId: userId });
      if (user) {
        (req as any).user = user;
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // Don't fail the request, just continue without user
    next();
  }
};
