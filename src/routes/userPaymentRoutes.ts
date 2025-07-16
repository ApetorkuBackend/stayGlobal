import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  setupPaystackAccount,
  setupMomoAccount,
  getPaymentAccount,
  getBanks,
  verifyAccountNumber,
  removePaymentAccount
} from '../controllers/userPaymentController';

const router = express.Router();

// Get list of banks (public endpoint for payment setup)
router.get('/banks', getBanks);

// Verify account number (public endpoint for payment setup)
router.post('/verify-account', verifyAccountNumber);

// All other routes require authentication
router.use(requireAuth);

// Get user's payment account
router.get('/account', getPaymentAccount);

// Set up Paystack account (allow any authenticated user, they become owners after setup)
router.post('/account/paystack', setupPaystackAccount);

// Set up Mobile Money account (allow any authenticated user, they become owners after setup)
router.post('/account/momo', setupMomoAccount);

// Remove payment account (owners only)
router.delete('/account', requireRole(['owner']), removePaymentAccount);

export default router;
