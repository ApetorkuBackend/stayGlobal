import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  setupPaystackAccount,
  setupMomoAccount,
  getPaymentAccount,
  getBanks,
  verifyAccountNumber,
  removePaymentAccount,
  initializeAccountSetup
} from '../controllers/userPaymentController';

const router = express.Router();

// Get list of banks (public endpoint for payment setup)
router.get('/banks', getBanks);

// Verify account number (public endpoint for payment setup)
router.post('/verify-account', verifyAccountNumber);

// Test endpoint to check Paystack configuration
router.get('/test-config', (req, res) => {
  res.json({
    paystackConfigured: !!process.env.PAYSTACK_SECRET_KEY,
    paystackKeyLength: process.env.PAYSTACK_SECRET_KEY?.length || 0,
    paystackKeyPrefix: process.env.PAYSTACK_SECRET_KEY?.substring(0, 7) || 'none',
    timestamp: new Date().toISOString()
  });
});

// All other routes require authentication
router.use(requireAuth);

// Initialize account setup with inline payment
router.post('/initialize-account-setup', initializeAccountSetup);

// Get user's payment account
router.get('/account', getPaymentAccount);

// Set up Paystack account (allow any authenticated user, they become owners after setup)
router.post('/account/paystack', setupPaystackAccount);

// Set up Mobile Money account (allow any authenticated user, they become owners after setup)
router.post('/account/momo', setupMomoAccount);

// Remove payment account (owners only)
router.delete('/account', requireRole(['owner']), removePaymentAccount);

export default router;
