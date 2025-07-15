import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  initializePayment,
  verifyPayment,
  verifySplitPayment,
  getPayment,
  getUserPayments
} from '../controllers/paymentController';

const router = express.Router();

// All payment routes require authentication
router.use(requireAuth);

// Initialize payment for a booking
router.post('/initialize', initializePayment);

// Verify payment (legacy)
router.get('/verify/:reference', verifyPayment);

// Verify split payment for bookings
router.post('/verify', verifySplitPayment);

// Get specific payment details
router.get('/:id', getPayment);

// Get user's payments
router.get('/', getUserPayments);

export default router;
