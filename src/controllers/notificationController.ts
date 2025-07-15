import { Request, Response } from 'express';
import NotificationService from '../services/notificationService';
import AutoCheckoutService from '../services/autoCheckoutService';

// Get notifications for the current user
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.clerkId;
    if (!userId) {
      console.error('❌ No user ID found in request');
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    console.log(`📬 Fetching notifications for user: ${userId}, limit: ${limit}`);

    const notifications = await NotificationService.getUserNotifications(userId, limit);

    console.log(`✅ Successfully fetched ${notifications.length} notifications`);
    res.json({
      message: 'Notifications retrieved successfully',
      notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    console.error('Error details:', (error as Error).message);
    console.error('Stack trace:', (error as Error).stack);
    res.status(500).json({
      error: 'Failed to fetch notifications',
      details: (error as Error).message
    });
  }
};

// Get admin-specific notifications
export const getAdminNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.clerkId;
    if (!userId) {
      console.error('❌ No user ID found in request');
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    console.log(`📬 Fetching admin notifications for user: ${userId}, limit: ${limit}`);

    // Admin notification types
    const adminTypes = ['system_alert', 'new_apartment', 'new_booking', 'verification_submitted', 'admin_message', 'payment_issue'];

    // Get notifications for both the current admin user and the system admin
    const notifications = await NotificationService.getAdminNotificationsForUser(userId, adminTypes, limit);

    console.log(`✅ Successfully fetched ${notifications.length} admin notifications`);
    res.json({
      message: 'Admin notifications retrieved successfully',
      notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('❌ Error fetching admin notifications:', error);
    res.status(500).json({
      error: 'Failed to fetch admin notifications',
      details: (error as Error).message
    });
  }
};

// Get user-specific notifications (excluding admin types)
export const getUserNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.clerkId;
    if (!userId) {
      console.error('❌ No user ID found in request');
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    console.log(`📬 Fetching user notifications for user: ${userId}, limit: ${limit}`);

    // User notification types (including new_booking for house owners)
    const userTypes = ['auto_checkout', 'booking_reminder', 'payment_received', 'new_message', 'checkout_reminder', 'new_booking'];

    const notifications = await NotificationService.getNotificationsByType(userId, userTypes, limit);

    console.log(`✅ Successfully fetched ${notifications.length} user notifications`);
    res.json({
      message: 'User notifications retrieved successfully',
      notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('❌ Error fetching user notifications:', error);
    res.status(500).json({
      error: 'Failed to fetch user notifications',
      details: (error as Error).message
    });
  }
};

// Mark a notification as read
export const markNotificationAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.clerkId;

    console.log(`📖 Marking notification ${id} as read for user: ${userId}`);

    const notification = await NotificationService.markAsRead(id, userId);

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user.clerkId;

    console.log(`📖 Marking all notifications as read for user: ${userId}`);

    const count = await NotificationService.markAllAsRead(userId);

    res.json({
      message: 'All notifications marked as read',
      markedCount: count
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

// Get unread notification count
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.clerkId;
    if (!userId) {
      console.error('❌ No user ID found in request for unread count');
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    console.log(`📊 Getting unread count for user: ${userId}`);
    const count = await NotificationService.getUnreadCount(userId);

    console.log(`✅ Unread count for user ${userId}: ${count}`);
    res.json({
      unreadCount: count
    });
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    console.error('Error details:', (error as Error).message);
    res.status(500).json({
      error: 'Failed to get unread count',
      details: (error as Error).message
    });
  }
};

// Manual trigger for auto checkout (admin/testing)
export const triggerAutoCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(`🔧 Manual auto checkout triggered by user: ${req.user.clerkId}`);

    // Only allow owners and admins to trigger manual checkout
    if (!['owner', 'admin'].includes(req.user.role || '')) {
      res.status(403).json({ error: 'Not authorized to trigger auto checkout' });
      return;
    }

    const result = await AutoCheckoutService.runManualCheckout();

    res.json({
      message: 'Auto checkout process completed',
      result
    });
  } catch (error) {
    console.error('Error triggering auto checkout:', error);
    res.status(500).json({ error: 'Failed to trigger auto checkout' });
  }
};

// Get upcoming checkouts (for owners to see what's coming)
export const getUpcomingCheckouts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user.clerkId;
    const hoursAhead = parseInt(req.query.hours as string) || 24;

    console.log(`📅 Getting upcoming checkouts for user: ${userId}`);

    // Only allow owners and admins
    if (!['owner', 'admin'].includes(req.user.role || '')) {
      res.status(403).json({ error: 'Not authorized to view upcoming checkouts' });
      return;
    }

    const upcomingCheckouts = await AutoCheckoutService.getUpcomingCheckouts(hoursAhead);

    // Filter by user's apartments if not admin
    let filteredCheckouts = upcomingCheckouts;
    if (req.user.role !== 'admin') {
      filteredCheckouts = upcomingCheckouts.filter(booking => 
        booking.apartmentId && booking.apartmentId.ownerId === userId
      );
    }

    res.json({
      message: 'Upcoming checkouts retrieved successfully',
      checkouts: filteredCheckouts,
      count: filteredCheckouts.length,
      hoursAhead
    });
  } catch (error) {
    console.error('Error getting upcoming checkouts:', error);
    res.status(500).json({ error: 'Failed to get upcoming checkouts' });
  }
};

// Create a test notification (for testing purposes)
export const createTestNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user.clerkId;
    const { type, title, message, priority } = req.body;

    console.log(`🧪 Creating test notification for user: ${userId}`);

    const notification = await NotificationService.createNotification({
      userId,
      type: type || 'checkout_reminder',
      title: title || 'Test Checkout Reminder ⏰',
      message: message || 'This is a test checkout reminder. Your checkout time is approaching in 45 minutes!',
      priority: priority || 'high'
    });

    res.json({
      message: 'Test notification created successfully',
      notification
    });
  } catch (error) {
    console.error('Error creating test notification:', error);
    res.status(500).json({ error: 'Failed to create test notification' });
  }
};
