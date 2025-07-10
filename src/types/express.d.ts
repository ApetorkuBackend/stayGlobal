import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user: {
        clerkId: string;
        role?: string;
        email?: string;
      };
      verificationStatus?: {
        isVerified: boolean;
        canListApartments: boolean;
        hasPaymentAccount: boolean;
        isPaymentVerified: boolean;
      };
    }
  }
}
