import express from 'express';
import {
  createBooking,
  createSecureBooking,
  getMyBookings,
  getOwnerBookings,
  getBookingById,
  getBookingByTicketCode,
  updateBookingStatus,
  cancelBooking,
  getApartmentBookings,
  updatePaymentStatus,
  getRoomAvailability,
  selfCheckout
} from '../controllers/bookingController';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBooking } from '../middleware/validation';
import { requireIdentityVerification, requireBiometricVerification } from '../middleware/verification';

const router = express.Router();

// All booking routes require authentication
router.use(requireAuth);

// Guest routes - Simple booking without payment validation
router.post('/', (req, res, next) => {
  console.log('🎯 DIRECT BOOKING ROUTE HIT!');
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  createBooking(req, res);
});
router.post('/secure',
  requireIdentityVerification,
  requireBiometricVerification,
  validateBooking,
  createSecureBooking
); // New secure booking with biometric verification
router.get('/my', getMyBookings);
router.patch('/:id/cancel', cancelBooking);

// Owner routes (specific routes must come before /:id)
router.get('/owner', requireRole(['owner', 'admin']), getOwnerBookings); // Get all bookings for owner's properties
router.get('/ticket/:ticketCode', requireRole(['owner', 'admin']), getBookingByTicketCode);
router.get('/apartment/:apartmentId', requireRole(['owner', 'admin']), getApartmentBookings);
router.get('/apartment/:apartmentId/rooms', requireRole(['owner', 'admin']), getRoomAvailability);
router.patch('/:id/status', requireRole(['owner', 'admin']), updateBookingStatus);

// Test route for debugging
router.get('/test-checkout/:id', (req, res) => {
  res.json({
    message: 'Checkout route is working',
    bookingId: req.params.id,
    timestamp: new Date().toISOString()
  });
});

// Specific action routes (must come before generic /:id route)
router.post('/:id/checkout', selfCheckout); // Self-checkout for renters
router.patch('/:id/payment', requireRole(['admin']), updatePaymentStatus); // Admin payment updates

// Generic ID route (must come last)
router.get('/:id', getBookingById);

export default router;
