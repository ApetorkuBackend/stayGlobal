import express from 'express';
import {
  getApartments,
  getApartmentById,
  createApartment,
  updateApartment,
  deleteApartment,
  getMyApartments
} from '../controllers/apartmentController';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth';
import { validateApartment } from '../middleware/validation';
import { requireFullVerification, addVerificationStatus } from '../middleware/verification';

const router = express.Router();

// Public routes
router.get('/', optionalAuth, getApartments);
router.get('/:id', optionalAuth, getApartmentById);

// Protected routes - specific routes first
router.get('/my/listings', requireAuth, requireRole(['owner', 'admin']), getMyApartments);
router.get('/owner', requireAuth, requireRole(['owner', 'admin']), getMyApartments);
router.post('/',
  (req, res, next) => {
    console.log('🏠 POST /apartments route hit');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    next();
  },
  requireAuth,
  requireRole(['owner', 'admin']),
  requireFullVerification, // Require identity verification + payment account
  validateApartment,
  createApartment
);
router.put('/:id', requireAuth, requireRole(['owner', 'admin']), updateApartment);
router.delete('/:id', requireAuth, requireRole(['owner', 'admin']), deleteApartment);

export default router;
