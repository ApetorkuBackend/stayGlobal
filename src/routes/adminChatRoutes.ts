import express from 'express';
import { requireAuth } from '@clerk/express';
import { requireAuth as customRequireAuth } from '../middleware/auth';
import User from '../models/User';
import {
  getAvailableOwners,
  getAdminChats,
  getOrCreateAdminChat,
  getAdminChatMessages,
  sendAdminMessage,
  markAdminMessagesAsRead,
  getOwnerAdminChats,
  getOwnerAdminChatMessages,
  sendOwnerAdminMessage,
  markOwnerAdminMessagesAsRead
} from '../controllers/adminChatController';

const router = express.Router();

// Simple middleware for admin chat routes (check if admin user exists)
const simpleAdminCheck = async (req: any, res: any, next: any) => {
  try {
    // Check if the admin user (bamenorhu8@gmail.com) exists and has admin role
    const adminUser = await User.findOne({
      email: 'bamenorhu8@gmail.com',
      role: 'admin'
    });

    if (!adminUser) {
      return res.status(403).json({
        error: 'Admin access required. Admin user not found.',
        hint: 'Please sign in with bamenorhu8@gmail.com and visit /api/admin/setup-admin'
      });
    }

    req.user = adminUser;
    next();
  } catch (error) {
    console.error('❌ Admin chat check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Owner routes (require authentication but not admin role)
router.use('/owner', (req, res, next) => {
  console.log('🔍 Owner admin chat route middleware hit:', req.path);
  console.log('🔍 Authorization header:', req.headers.authorization ? 'Present' : 'Missing');
  next();
}, customRequireAuth, (req, res, next) => {
  console.log('🔍 After custom auth middleware - req.user:', req.user ? 'Present' : 'Missing');
  if (req.user) {
    console.log('🔍 User details:', { clerkId: req.user.clerkId, email: req.user.email, role: req.user.role });
  }
  next();
});

// Owner-specific admin chat routes
router.get('/owner/chats', (req, res, next) => {
  console.log('🔍 Owner chats route hit');
  next();
}, getOwnerAdminChats);
router.get('/owner/chats/:chatId/messages', getOwnerAdminChatMessages);
router.post('/owner/chats/:chatId/messages', sendOwnerAdminMessage);
router.patch('/owner/chats/:chatId/read', markOwnerAdminMessagesAsRead);

// Apply simple admin check to admin routes
router.use(simpleAdminCheck);

// Get available house owners for chat
router.get('/available-owners', getAvailableOwners);

// Get all admin chats
router.get('/', getAdminChats);

// Get or create chat with a specific owner
router.get('/owner/:ownerId', getOrCreateAdminChat);

// Get messages for a specific admin chat
router.get('/:chatId/messages', getAdminChatMessages);

// Send message to an admin chat
router.post('/:chatId/messages', sendAdminMessage);

// Mark messages as read in an admin chat
router.patch('/:chatId/read', markAdminMessagesAsRead);



export default router;
