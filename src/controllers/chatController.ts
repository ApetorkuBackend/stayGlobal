import { Request, Response } from 'express';
import ChatService from '../services/chatService';
import Booking from '../models/Booking';
import Apartment from '../models/Apartment';

// Get or create chat for a booking
export const getOrCreateChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.clerkId;

    console.log(`💬 Getting/creating chat for booking ${bookingId} by user ${userId}`);

    // Verify user has access to this booking
    const booking = await Booking.findById(bookingId).populate('apartmentId');
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    const apartment = booking.apartmentId as any;
    const isOwner = apartment.ownerId === userId;
    const isRenter = booking.guestId === userId;

    if (!isOwner && !isRenter) {
      res.status(403).json({ error: 'Not authorized to access this chat' });
      return;
    }

    const chat = await ChatService.getOrCreateChat(bookingId);

    res.json({
      message: 'Chat retrieved successfully',
      chat,
      userType: isOwner ? 'owner' : 'renter'
    });
  } catch (error) {
    console.error('Error getting/creating chat:', error);
    res.status(500).json({ error: 'Failed to get chat' });
  }
};

// Send a message
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;
    const userId = req.user.clerkId;

    console.log(`💬 Sending message in chat ${chatId} by user ${userId}`);

    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    // Determine user type
    const chat = await ChatService.getUserChats(userId, 'owner');
    const ownerChat = chat.find(c => (c._id as string).toString() === chatId);
    const userType = ownerChat ? 'owner' : 'renter';

    const newMessage = await ChatService.sendMessage(chatId, userId, message, userType);

    res.json({
      message: 'Message sent successfully',
      messageData: newMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Get messages for a chat
export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const userId = req.user.clerkId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    console.log(`💬 Getting messages for chat ${chatId} by user ${userId}`);

    const result = await ChatService.getMessages(chatId, userId, page, limit);

    res.json({
      message: 'Messages retrieved successfully',
      ...result
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// Get user's chats
export const getUserChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user.clerkId;
    const userRole = req.user.role;

    console.log(`💬 Getting chats for user ${userId} with role ${userRole}`);

    // Determine user type based on role and check both owner and renter chats
    let chats: any[] = [];
    
    if (userRole === 'owner' || userRole === 'admin') {
      const ownerChats = await ChatService.getUserChats(userId, 'owner');
      chats = [...chats, ...ownerChats];
    }

    // Also check for renter chats (users can be both owners and renters)
    const renterChats = await ChatService.getUserChats(userId, 'renter');
    chats = [...chats, ...renterChats];

    // Remove duplicates and sort by last message
    const uniqueChats = chats.filter((chat, index, self) => 
      index === self.findIndex(c => c._id.toString() === chat._id.toString())
    ).sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    res.json({
      message: 'Chats retrieved successfully',
      chats: uniqueChats,
      count: uniqueChats.length
    });
  } catch (error) {
    console.error('Error getting user chats:', error);
    res.status(500).json({ error: 'Failed to get chats' });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const userId = req.user.clerkId;

    console.log(`💬 Marking messages as read in chat ${chatId} by user ${userId}`);

    // Determine user type
    const ownerChats = await ChatService.getUserChats(userId, 'owner');
    const renterChats = await ChatService.getUserChats(userId, 'renter');
    
    const isOwnerChat = ownerChats.some(c => (c._id as string).toString() === chatId);
    const isRenterChat = renterChats.some(c => (c._id as string).toString() === chatId);
    
    if (!isOwnerChat && !isRenterChat) {
      res.status(403).json({ error: 'Not authorized to access this chat' });
      return;
    }

    const userType = isOwnerChat ? 'owner' : 'renter';
    await ChatService.markMessagesAsRead(chatId, userId, userType);

    res.json({
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

// Get chat by booking ID (for easy access)
export const getChatByBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.clerkId;

    console.log(`💬 Getting chat by booking ${bookingId} for user ${userId}`);

    // Verify user has access to this booking
    const booking = await Booking.findById(bookingId).populate('apartmentId');
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    const apartment = booking.apartmentId as any;
    const isOwner = apartment.ownerId === userId;
    const isRenter = booking.guestId === userId;

    if (!isOwner && !isRenter) {
      res.status(403).json({ error: 'Not authorized to access this chat' });
      return;
    }

    const chat = await ChatService.getOrCreateChat(bookingId);

    res.json({
      message: 'Chat found successfully',
      chat,
      userType: isOwner ? 'owner' : 'renter'
    });
  } catch (error) {
    console.error('Error getting chat by booking:', error);
    res.status(500).json({ error: 'Failed to get chat' });
  }
};

// Create chats for all existing bookings (utility endpoint)
export const createChatsForExistingBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user.clerkId;
    const userRole = req.user.role;

    console.log(`💬 Creating chats for existing bookings - User: ${userId}, Role: ${userRole}`);

    // Only allow admins or owners to run this utility
    if (userRole !== 'admin' && userRole !== 'owner') {
      res.status(403).json({ error: 'Not authorized to run this utility' });
      return;
    }

    // Get all confirmed or checked-in bookings
    const bookings = await Booking.find({
      bookingStatus: { $in: ['confirmed', 'checked-in'] }
    }).populate('apartmentId');

    console.log(`📋 Found ${bookings.length} bookings to process`);

    let created = 0;
    let existing = 0;
    let errors = 0;

    for (const booking of bookings) {
      try {
        const chat = await ChatService.getOrCreateChat((booking._id as string).toString());
        if (chat.createdAt.getTime() === chat.updatedAt.getTime()) {
          created++;
          console.log(`✅ Created chat for booking ${booking._id}`);
        } else {
          existing++;
          console.log(`ℹ️ Chat already exists for booking ${booking._id}`);
        }
      } catch (error) {
        errors++;
        console.error(`❌ Failed to create chat for booking ${booking._id}:`, error);
      }
    }

    res.json({
      message: 'Chat creation process completed',
      summary: {
        totalBookings: bookings.length,
        chatsCreated: created,
        existingChats: existing,
        errors: errors
      }
    });
  } catch (error) {
    console.error('Error creating chats for existing bookings:', error);
    res.status(500).json({ error: 'Failed to create chats for existing bookings' });
  }
};
