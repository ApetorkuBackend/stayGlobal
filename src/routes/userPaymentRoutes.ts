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

// All routes require authentication
router.use(requireAuth);

// Get user's payment account
router.get('/account', getPaymentAccount);

// Set up Paystack account (owners only)
router.post('/account/paystack', requireRole(['owner']), setupPaystackAccount);

// Set up Mobile Money account (owners only)
router.post('/account/momo', requireRole(['owner']), setupMomoAccount);

// Remove payment account (owners only)
router.delete('/account', requireRole(['owner']), removePaymentAccount);

// Get list of banks
router.get('/banks', getBanks);

// Verify account number
router.post('/verify-account', verifyAccountNumber);

export default router;
