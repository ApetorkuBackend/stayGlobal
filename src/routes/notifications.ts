import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  getNotifications,
  getAdminNotifications,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  triggerAutoCheckout,
  getUpcomingCheckouts,
  createTestNotification
} from '../controllers/notificationController';

const router = express.Router();

// All notification routes require authentication
router.use(requireAuth);

// Get notifications for current user
router.get('/', getNotifications);

// Get admin-specific notifications
router.get('/admin', requireRole(['admin']), getAdminNotifications);

// Get user-specific notifications (excluding admin types)
router.get('/user', getUserNotifications);

// Get unread notification count
router.get('/unread-count', getUnreadCount);

// Get upcoming checkouts (owners/admins only)
router.get('/upcoming-checkouts', requireRole(['owner', 'admin']), getUpcomingCheckouts);

// Mark specific notification as read
router.patch('/:id/read', markNotificationAsRead);

// Mark all notifications as read
router.patch('/mark-all-read', markAllNotificationsAsRead);

// Manual trigger for auto checkout (owners/admins only)
router.post('/trigger-auto-checkout', requireRole(['owner', 'admin']), triggerAutoCheckout);

// Create test notification (for testing)
router.post('/test', createTestNotification);

export default router;
