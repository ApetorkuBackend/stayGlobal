import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import IdentityVerification from '../models/IdentityVerification';

// Extend Express Request type to include verification info
declare global {
  namespace Express {
    interface Request {
      verificationStatus?: {
        isIdentityVerified: boolean;
        hasPaymentAccount: boolean;
        isPaymentVerified: boolean;
        verificationLevel: string;
        canListApartments: boolean;
        canMakeBookings: boolean;
      };
    }
  }
}

/**
 * Middleware to check if user has completed identity verification
 */
export const requireIdentityVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = (req as any).user;
    if (!reqUser) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please sign in to continue'
      });
      return;
    }

    const user = await User.findOne({ clerkId: reqUser.clerkId });
    if (!user) {
      res.status(401).json({
        error: 'User not found',
        message: 'Please complete your profile setup'
      });
      return;
    }

    // Check identity verification status
    const isVerified = user.identityVerification?.isVerified || false;
    const verificationLevel = user.identityVerification?.verificationLevel || 'none';

    if (!isVerified || verificationLevel !== 'fully_verified') {
      res.status(403).json({
        error: 'Identity verification required',
        message: 'You must complete identity verification to access this feature',
        verificationStatus: {
          isVerified,
          verificationLevel,
          requiresAction: true
        }
      });
      return;
    }

    // Add verification status to request for downstream use
    req.verificationStatus = {
      isIdentityVerified: true,
      hasPaymentAccount: !!user.paymentAccount,
      isPaymentVerified: user.paymentAccount?.isVerified || false,
      verificationLevel,
      canListApartments: true,
      canMakeBookings: true
    };

    next();
  } catch (error) {
    console.error('Identity verification middleware error:', error);
    res.status(500).json({
      error: 'Verification check failed',
      message: 'Unable to verify identity status'
    });
  }
};

/**
 * Middleware to check if user has verified payment account
 */
export const requirePaymentAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = (req as any).user;
    if (!reqUser) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please sign in to continue'
      });
      return;
    }

    const user = await User.findOne({ clerkId: reqUser.clerkId });
    if (!user) {
      res.status(401).json({
        error: 'User not found',
        message: 'Please complete your profile setup'
      });
      return;
    }

    // Check payment account status
    const hasPaymentAccount = !!user.paymentAccount;
    const isPaymentVerified = user.paymentAccount?.isVerified || false;

    if (!hasPaymentAccount || !isPaymentVerified) {
      res.status(403).json({
        error: 'Payment account required',
        message: 'You must set up and verify a payment account to access this feature',
        paymentStatus: {
          hasAccount: hasPaymentAccount,
          isVerified: isPaymentVerified,
          requiresAction: true
        }
      });
      return;
    }

    // Update verification status if it exists
    if (req.verificationStatus) {
      req.verificationStatus.hasPaymentAccount = true;
      req.verificationStatus.isPaymentVerified = true;
    }

    next();
  } catch (error) {
    console.error('Payment account middleware error:', error);
    res.status(500).json({
      error: 'Payment verification check failed',
      message: 'Unable to verify payment account status'
    });
  }
};

/**
 * Middleware to check full verification (identity + payment) for apartment listing
 */
export const requireFullVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = (req as any).user;
    if (!reqUser) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please sign in to continue'
      });
      return;
    }

    const user = await User.findOne({ clerkId: reqUser.clerkId });
    if (!user) {
      res.status(401).json({
        error: 'User not found',
        message: 'Please complete your profile setup'
      });
      return;
    }

    // Check identity verification
    const isIdentityVerified = user.identityVerification?.isVerified || false;
    const verificationLevel = user.identityVerification?.verificationLevel || 'none';

    // Check payment account
    const hasPaymentAccount = !!user.paymentAccount;
    const isPaymentVerified = user.paymentAccount?.isVerified || false;

    const verificationStatus = {
      isIdentityVerified,
      hasPaymentAccount,
      isPaymentVerified,
      verificationLevel,
      canListApartments: isIdentityVerified && hasPaymentAccount && isPaymentVerified,
      canMakeBookings: isIdentityVerified
    };

    if (!verificationStatus.canListApartments) {
      const missingRequirements = [];
      if (!isIdentityVerified) missingRequirements.push('identity verification');
      if (!hasPaymentAccount) missingRequirements.push('payment account setup');
      if (!isPaymentVerified) missingRequirements.push('payment account verification');

      res.status(403).json({
        error: 'Full verification required',
        message: `You must complete ${missingRequirements.join(' and ')} to list apartments`,
        verificationStatus,
        missingRequirements
      });
      return;
    }

    req.verificationStatus = verificationStatus;
    next();
  } catch (error) {
    console.error('Full verification middleware error:', error);
    res.status(500).json({
      error: 'Verification check failed',
      message: 'Unable to verify account status'
    });
  }
};

/**
 * Middleware to check biometric verification for sensitive operations
 */
export const requireBiometricVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fingerprintData } = req.body;

    if (!fingerprintData) {
      res.status(400).json({
        error: 'Biometric verification required',
        message: 'Fingerprint verification is required for this operation'
      });
      return;
    }

    // Validate fingerprint data structure
    if (!fingerprintData.template || !fingerprintData.quality) {
      res.status(400).json({
        error: 'Invalid biometric data',
        message: 'Valid fingerprint template and quality score are required'
      });
      return;
    }

    // Check minimum quality threshold
    if (fingerprintData.quality < 60) {
      res.status(400).json({
        error: 'Biometric quality too low',
        message: 'Fingerprint quality must be at least 60% for verification'
      });
      return;
    }

    // The actual biometric verification will be handled in the controller
    // This middleware just validates the presence and format of biometric data
    next();
  } catch (error) {
    console.error('Biometric verification middleware error:', error);
    res.status(500).json({
      error: 'Biometric verification check failed',
      message: 'Unable to process biometric data'
    });
  }
};

/**
 * Middleware to add verification status to request without blocking
 */
export const addVerificationStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = (req as any).user;
    if (!reqUser) {
      next();
      return;
    }

    const user = await User.findOne({ clerkId: reqUser.clerkId });
    if (!user) {
      next();
      return;
    }

    // Add verification status to request
    req.verificationStatus = {
      isIdentityVerified: user.identityVerification?.isVerified || false,
      hasPaymentAccount: !!user.paymentAccount,
      isPaymentVerified: user.paymentAccount?.isVerified || false,
      verificationLevel: user.identityVerification?.verificationLevel || 'none',
      canListApartments: (user.identityVerification?.isVerified || false) && 
                        (user.paymentAccount?.isVerified || false),
      canMakeBookings: user.identityVerification?.isVerified || false
    };

    next();
  } catch (error) {
    console.error('Add verification status middleware error:', error);
    // Don't block the request, just continue without verification status
    next();
  }
};

/**
 * Middleware to check rate limiting for verification attempts
 */
export const rateLimitVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = (req as any).user;
    if (!reqUser) {
      res.status(401).json({
        error: 'Authentication required'
      });
      return;
    }

    const userId = reqUser.clerkId;
    const ipAddress = req.ip;
    
    // Check recent verification attempts from this user/IP
    const recentAttempts = await IdentityVerification.find({
      $or: [
        { userId },
        { 'fraudPrevention.ipAddress': ipAddress }
      ],
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    if (recentAttempts.length >= 3) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many verification attempts. Please try again later.',
        retryAfter: 3600 // 1 hour
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Rate limit verification middleware error:', error);
    res.status(500).json({
      error: 'Rate limit check failed'
    });
  }
};
