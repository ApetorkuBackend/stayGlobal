import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { rateLimitVerification } from '../middleware/verification';
import {
  submitIdentityVerification,
  submitSimpleVerification,
  getVerificationStatus,
  verifyFingerprint,
  uploadDocuments,
  getVerificationHistory,
  adminApproveVerification,
  adminRejectVerification,
  getVerificationsList,
  resetUserVerification
} from '../controllers/identityVerificationController';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Add logging middleware for debugging
router.use((req, res, next) => {
  console.log(`🔍 Identity verification route hit: ${req.method} ${req.path}`);
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  console.log('📋 Request headers:', req.headers);
  next();
});

// User routes - for property owners to submit verification
// Note: Allow any authenticated user to submit verification, they will become owners after verification
router.post('/submit', rateLimitVerification, submitIdentityVerification);
router.post('/simple', rateLimitVerification, submitSimpleVerification);
router.get('/status', getVerificationStatus);
router.post('/verify-fingerprint', verifyFingerprint);
router.post('/upload-documents', requireRole(['owner']), uploadDocuments);
router.get('/history', getVerificationHistory);

// Admin routes - for managing verifications
router.get('/admin/list', requireRole(['admin']), getVerificationsList);
router.post('/admin/:verificationId/approve', requireRole(['admin']), adminApproveVerification);
router.post('/admin/:verificationId/reject', requireRole(['admin']), adminRejectVerification);
router.delete('/admin/reset/:userId', requireRole(['admin']), resetUserVerification);

export default router;
