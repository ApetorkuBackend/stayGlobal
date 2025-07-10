import { Request, Response } from 'express';
import { AdminChat, AdminMessage } from '../models/AdminChat';
import User from '../models/User';
import Apartment from '../models/Apartment';
import NotificationService from '../services/notificationService';

// Get available house owners for chat
export const getAvailableOwners = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('👥 Getting available house owners for chat...');

    // Get all unique owner IDs from apartments
    const apartmentOwnerIds = await Apartment.distinct('ownerId');
    console.log(`👥 Found ${apartmentOwnerIds.length} apartment owners`);

    // Get users who own apartments
    const owners = await User.find({
      clerkId: { $in: apartmentOwnerIds },
      status: 'active' // Only active owners
    })
    .select('clerkId firstName lastName email createdAt')
    .sort({ firstName: 1, lastName: 1 })
    .lean();

    console.log(`👥 Found ${owners.length} active house owners`);

    // Format owners for chat selection
    const formattedOwners = owners.map(owner => ({
      clerkId: owner.clerkId,
      name: `${owner.firstName} ${owner.lastName}`,
      email: owner.email,
      joinDate: owner.createdAt
    }));

    res.json({
      owners: formattedOwners,
      total: formattedOwners.length
    });
  } catch (error) {
    console.error('❌ Error getting available owners:', error);
    res.status(500).json({ error: 'Failed to get available owners' });
  }
};

// Get all admin chats
export const getAdminChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.user.clerkId;
    console.log(`💬 Getting admin chats for admin: ${adminId}`);

    const chats = await AdminChat.find({
      adminId,
      isActive: true
    })
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .lean();

    console.log(`💬 Found ${chats.length} admin chats`);

    res.json({
      chats,
      total: chats.length
    });
  } catch (error) {
    console.error('❌ Error getting admin chats:', error);
    res.status(500).json({ error: 'Failed to get admin chats' });
  }
};

// Get or create chat with a house owner
export const getOrCreateAdminChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ownerId } = req.params;
    const adminId = req.user.clerkId;
    
    console.log(`💬 Getting/creating admin chat between admin ${adminId} and owner ${ownerId}`);

    // Check if chat already exists
    let chat = await AdminChat.findOne({ adminId, ownerId });

    if (!chat) {
      // Get owner and admin details
      const [owner, admin] = await Promise.all([
        User.findOne({ clerkId: ownerId }),
        User.findOne({ clerkId: adminId })
      ]);

      if (!owner) {
        res.status(404).json({ error: 'Owner not found' });
        return;
      }

      if (!admin) {
        res.status(404).json({ error: 'Admin not found' });
        return;
      }

      // Create new chat
      chat = new AdminChat({
        adminId,
        ownerId,
        ownerName: `${owner.firstName} ${owner.lastName}`,
        ownerEmail: owner.email,
        adminName: `${admin.firstName} ${admin.lastName}`,
        subject: `Admin Support - ${owner.firstName} ${owner.lastName}`,
        isActive: true,
        unreadCount: { admin: 0, owner: 0 }
      });

      await chat.save();
      console.log(`✅ Created new admin chat: ${chat._id}`);
    } else {
      console.log(`ℹ️ Using existing admin chat: ${chat._id}`);
    }

    res.json({
      message: 'Chat retrieved successfully',
      chat
    });
  } catch (error) {
    console.error('❌ Error getting/creating admin chat:', error);
    res.status(500).json({ error: 'Failed to get/create admin chat' });
  }
};

// Get messages for an admin chat
export const getAdminChatMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    console.log(`💬 Getting messages for admin chat ${chatId}, page ${page}`);

    // Verify chat exists and user has access
    const chat = await AdminChat.findById(chatId);
    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    const messages = await AdminMessage.find({ chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Reverse to show oldest first
    messages.reverse();

    console.log(`💬 Found ${messages.length} messages for chat ${chatId}`);

    res.json({
      messages,
      hasMore: messages.length === limit,
      page,
      total: await AdminMessage.countDocuments({ chatId })
    });
  } catch (error) {
    console.error('❌ Error getting admin chat messages:', error);
    res.status(500).json({ error: 'Failed to get chat messages' });
  }
};

// Send message in admin chat
export const sendAdminMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;
    const senderId = req.user.clerkId;

    console.log(`💬 Sending admin message in chat ${chatId} by user ${senderId}`);

    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    // Verify chat exists
    const chat = await AdminChat.findById(chatId);
    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    // Determine sender type and name
    const isAdmin = senderId === chat.adminId;
    const senderType = isAdmin ? 'admin' : 'owner';
    const senderName = isAdmin ? chat.adminName : chat.ownerName;

    // Create message
    const newMessage = new AdminMessage({
      chatId,
      senderId,
      senderType,
      senderName,
      message: message.trim(),
      messageType: 'text',
      isRead: false
    });

    await newMessage.save();

    // Update chat with last message info
    const updateData: any = {
      lastMessage: message.trim().substring(0, 200),
      lastMessageAt: new Date(),
      lastMessageBy: senderId
    };

    // Increment unread count for the recipient
    if (isAdmin) {
      updateData['unreadCount.owner'] = chat.unreadCount.owner + 1;
    } else {
      updateData['unreadCount.admin'] = chat.unreadCount.admin + 1;
    }

    await AdminChat.findByIdAndUpdate(chatId, updateData);

    console.log(`✅ Admin message sent: ${newMessage._id}`);

    res.json({
      message: 'Message sent successfully',
      messageData: newMessage
    });
  } catch (error) {
    console.error('❌ Error sending admin message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Mark messages as read in admin chat
export const markAdminMessagesAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const userId = req.user.clerkId;

    console.log(`💬 Marking admin messages as read in chat ${chatId} by user ${userId}`);

    // Verify chat exists
    const chat = await AdminChat.findById(chatId);
    if (!chat) {
      res.status(404).json({ error: 'Chat not found' });
      return;
    }

    const isAdmin = userId === chat.adminId;

    // Mark unread messages as read
    await AdminMessage.updateMany(
      { 
        chatId, 
        senderId: { $ne: userId }, // Messages not sent by current user
        isRead: false 
      },
      { 
        isRead: true, 
        readAt: new Date() 
      }
    );

    // Reset unread count for current user
    const updateData = isAdmin 
      ? { 'unreadCount.admin': 0 }
      : { 'unreadCount.owner': 0 };

    await AdminChat.findByIdAndUpdate(chatId, updateData);

    console.log(`✅ Marked admin messages as read in chat ${chatId}`);

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('❌ Error marking admin messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

// ===== OWNER ADMIN CHAT FUNCTIONS =====

// Get owner's admin chats
export const getOwnerAdminChats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔍 getOwnerAdminChats called');
    console.log('👤 Request user:', req.user);

    const ownerId = req.user.clerkId;
    console.log(`👥 Getting admin chats for owner ${ownerId}`);

    const chats = await AdminChat.find({ ownerId })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();

    console.log(`✅ Found ${chats.length} admin chats for owner ${ownerId}`);
    console.log('📋 Chats:', chats);

    res.json({
      chats,
      total: chats.length
    });
  } catch (error) {
    console.error('❌ Error getting owner admin chats:', error);
    res.status(500).json({ error: 'Failed to get admin chats' });
  }
};

// Get messages for owner's admin chat
export const getOwnerAdminChatMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const ownerId = req.user.clerkId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    console.log(`💬 Getting messages for owner admin chat ${chatId}, page ${page}`);

    // Verify chat belongs to owner
    const chat = await AdminChat.findOne({ _id: chatId, ownerId });
    if (!chat) {
      res.status(404).json({ error: 'Chat not found or access denied' });
      return;
    }

    const messages = await AdminMessage.find({ chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await AdminMessage.countDocuments({ chatId });
    const hasMore = skip + messages.length < total;

    // Reverse to show oldest first
    messages.reverse();

    console.log(`✅ Retrieved ${messages.length} messages for owner admin chat ${chatId}`);

    res.json({
      messages,
      hasMore,
      page,
      total
    });
  } catch (error) {
    console.error('❌ Error getting owner admin chat messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// Send message from owner to admin
export const sendOwnerAdminMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;
    const ownerId = req.user.clerkId;

    console.log(`💬 Owner ${ownerId} sending message to admin chat ${chatId}`);

    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    // Verify chat belongs to owner
    const chat = await AdminChat.findOne({ _id: chatId, ownerId });
    if (!chat) {
      res.status(404).json({ error: 'Chat not found or access denied' });
      return;
    }

    // Create message
    const newMessage = new AdminMessage({
      chatId,
      senderId: ownerId,
      senderType: 'owner',
      senderName: chat.ownerName,
      message: message.trim(),
      messageType: 'text',
      isRead: false
    });

    await newMessage.save();

    // Update chat with last message info and increment admin unread count
    const updateData = {
      lastMessage: message.trim().substring(0, 200),
      lastMessageAt: new Date(),
      lastMessageBy: ownerId,
      'unreadCount.admin': chat.unreadCount.admin + 1
    };

    await AdminChat.findByIdAndUpdate(chatId, updateData);

    // Send notification to admin about new message from owner
    try {
      await NotificationService.createAdminChatNotification({
        ownerId: chat.ownerId,
        ownerName: chat.ownerName,
        message: message.trim(),
        chatId: chatId
      });
    } catch (notificationError) {
      console.error('⚠️ Failed to send admin notification for owner message:', notificationError);
      // Don't fail the message sending if notification fails
    }

    console.log(`✅ Owner message sent to admin chat ${chatId}`);

    res.json({
      message: 'Message sent successfully',
      messageData: newMessage
    });
  } catch (error) {
    console.error('❌ Error sending owner admin message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Mark admin messages as read by owner
export const markOwnerAdminMessagesAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const ownerId = req.user.clerkId;

    console.log(`👁️ Owner ${ownerId} marking admin messages as read in chat ${chatId}`);

    // Verify chat belongs to owner
    const chat = await AdminChat.findOne({ _id: chatId, ownerId });
    if (!chat) {
      res.status(404).json({ error: 'Chat not found or access denied' });
      return;
    }

    // Mark all unread messages from admin as read
    await AdminMessage.updateMany(
      {
        chatId,
        senderType: 'admin', // Only admin messages
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    // Reset owner unread count
    await AdminChat.findByIdAndUpdate(chatId, { 'unreadCount.owner': 0 });

    console.log(`✅ Owner marked admin messages as read in chat ${chatId}`);

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('❌ Error marking owner admin messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};
