import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getOrCreateChat,
  sendMessage,
  getMessages,
  getUserChats,
  markMessagesAsRead,
  getChatByBooking,
  createChatsForExistingBookings
} from '../controllers/chatController';

const router = express.Router();

// All chat routes require authentication
router.use(requireAuth);

// Get user's chats
router.get('/', getUserChats);

// Get or create chat for a booking
router.get('/booking/:bookingId', getOrCreateChat);

// Get chat by booking ID (alternative endpoint)
router.get('/by-booking/:bookingId', getChatByBooking);

// Get messages for a specific chat
router.get('/:chatId/messages', getMessages);

// Send a message to a chat
router.post('/:chatId/messages', sendMessage);

// Mark messages as read in a chat
router.patch('/:chatId/read', markMessagesAsRead);

// Utility: Create chats for all existing bookings
router.post('/create-for-existing-bookings', createChatsForExistingBookings);

export default router;
