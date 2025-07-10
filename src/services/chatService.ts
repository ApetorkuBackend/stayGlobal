import { Chat, Message, IChat, IMessage } from '../models/Chat';
import Booking from '../models/Booking';
import Apartment from '../models/Apartment';
import User from '../models/User';
import NotificationService from './notificationService';

export class ChatService {
  // Create or get existing chat for a booking
  static async getOrCreateChat(bookingId: string): Promise<IChat> {
    try {
      // Check if chat already exists
      let chat = await Chat.findOne({ bookingId, isActive: true });
      if (chat) {
        console.log(`✅ Found existing chat for booking ${bookingId}`);
        return chat;
      }

      // Get booking details
      const booking = await Booking.findById(bookingId).populate('apartmentId');
      if (!booking) {
        throw new Error('Booking not found');
      }

      const apartment = booking.apartmentId as any;
      if (!apartment) {
        throw new Error('Apartment not found');
      }

      // Get owner details
      const owner = await User.findOne({ clerkId: apartment.ownerId });
      if (!owner) {
        throw new Error('Owner not found');
      }

      // Create new chat
      chat = new Chat({
        bookingId: booking._id,
        apartmentId: apartment._id,
        ownerId: apartment.ownerId,
        renterId: booking.guestId,
        renterName: booking.guestName,
        ownerName: owner.firstName ? `${owner.firstName} ${owner.lastName}` : owner.email,
        apartmentTitle: apartment.title,
        roomNumber: booking.roomNumber,
        isActive: true,
        unreadCount: {
          owner: 0,
          renter: 0
        }
      });

      await chat.save();
      console.log(`✅ Created new chat for booking ${bookingId}`);
      return chat;
    } catch (error) {
      console.error('❌ Error creating/getting chat:', error);
      throw error;
    }
  }

  // Send a message
  static async sendMessage(
    chatId: string,
    senderId: string,
    message: string,
    senderType: 'owner' | 'renter'
  ): Promise<IMessage> {
    try {
      // Verify chat exists and user has permission
      const chat = await Chat.findById(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      // Verify sender has permission to send to this chat
      if (senderType === 'owner' && chat.ownerId !== senderId) {
        throw new Error('Not authorized to send messages in this chat');
      }
      if (senderType === 'renter' && chat.renterId !== senderId) {
        throw new Error('Not authorized to send messages in this chat');
      }

      // Create message
      const newMessage = new Message({
        chatId: chat._id,
        senderId,
        senderType,
        message: message.trim(),
        messageType: 'text',
        isRead: false
      });

      await newMessage.save();

      // Update chat with last message info
      const messagePreview = message.length > 100 ? message.substring(0, 100) + '...' : message;
      
      // Update unread count for the recipient
      const updateData: any = {
        lastMessage: messagePreview,
        lastMessageAt: new Date(),
        lastMessageBy: senderId
      };

      if (senderType === 'owner') {
        updateData['unreadCount.renter'] = chat.unreadCount.renter + 1;
      } else {
        updateData['unreadCount.owner'] = chat.unreadCount.owner + 1;
      }

      await Chat.findByIdAndUpdate(chatId, updateData);

      // Create notification for the recipient
      try {
        const recipientId = senderType === 'owner' ? chat.renterId : chat.ownerId;
        const senderUser = await User.findOne({ clerkId: senderId });
        const senderName = senderUser ?
          (senderUser.firstName ? `${senderUser.firstName} ${senderUser.lastName}` : senderUser.email) :
          (senderType === 'owner' ? 'Property Owner' : 'Guest');

        await NotificationService.createMessageNotification(
          recipientId,
          senderName,
          message,
          chat.apartmentTitle,
          chat.roomNumber
        );
      } catch (notificationError) {
        console.error('⚠️ Failed to create message notification:', notificationError);
        // Don't fail the message sending if notification creation fails
      }

      console.log(`✅ Message sent in chat ${chatId} by ${senderType} ${senderId}`);
      return newMessage;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }

  // Get messages for a chat
  static async getMessages(
    chatId: string,
    userId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ messages: IMessage[]; totalPages: number; currentPage: number }> {
    try {
      // Verify user has access to this chat
      const chat = await Chat.findById(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      if (chat.ownerId !== userId && chat.renterId !== userId) {
        throw new Error('Not authorized to view this chat');
      }

      const skip = (page - 1) * limit;
      
      const messages = await Message.find({ chatId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const totalMessages = await Message.countDocuments({ chatId });
      const totalPages = Math.ceil(totalMessages / limit);

      // Mark messages as read for the current user
      const userType = chat.ownerId === userId ? 'owner' : 'renter';
      await this.markMessagesAsRead(chatId, userId, userType);

      console.log(`✅ Retrieved ${messages.length} messages for chat ${chatId}`);
      return {
        messages: messages.reverse(), // Reverse to show oldest first
        totalPages,
        currentPage: page
      };
    } catch (error) {
      console.error('❌ Error getting messages:', error);
      throw error;
    }
  }

  // Get user's chats
  static async getUserChats(
    userId: string,
    userType: 'owner' | 'renter'
  ): Promise<IChat[]> {
    try {
      const query = userType === 'owner' 
        ? { ownerId: userId, isActive: true }
        : { renterId: userId, isActive: true };

      const chats = await Chat.find(query)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .lean();

      console.log(`✅ Retrieved ${chats.length} chats for ${userType} ${userId}`);
      return chats;
    } catch (error) {
      console.error('❌ Error getting user chats:', error);
      throw error;
    }
  }

  // Mark messages as read
  static async markMessagesAsRead(
    chatId: string,
    userId: string,
    userType: 'owner' | 'renter'
  ): Promise<void> {
    try {
      // Mark unread messages as read
      await Message.updateMany(
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

      // Reset unread count for this user
      const updateField = userType === 'owner' ? 'unreadCount.owner' : 'unreadCount.renter';
      await Chat.findByIdAndUpdate(chatId, {
        [updateField]: 0
      });

      console.log(`✅ Marked messages as read for ${userType} ${userId} in chat ${chatId}`);
    } catch (error) {
      console.error('❌ Error marking messages as read:', error);
      throw error;
    }
  }

  // Check if user can chat with another user (based on active booking)
  static async canUsersChat(userId1: string, userId2: string): Promise<boolean> {
    try {
      // Check if there's an active booking between these users
      const activeBooking = await Booking.findOne({
        $or: [
          { guestId: userId1, apartmentId: { $in: await this.getUserApartments(userId2) } },
          { guestId: userId2, apartmentId: { $in: await this.getUserApartments(userId1) } }
        ],
        bookingStatus: { $in: ['confirmed', 'checked-in'] }
      });

      return !!activeBooking;
    } catch (error) {
      console.error('❌ Error checking if users can chat:', error);
      return false;
    }
  }

  // Helper: Get user's apartment IDs
  private static async getUserApartments(userId: string): Promise<string[]> {
    try {
      const apartments = await Apartment.find({ ownerId: userId }).select('_id');
      return apartments.map(apt => (apt._id as string).toString());
    } catch (error) {
      console.error('❌ Error getting user apartments:', error);
      return [];
    }
  }

  // Deactivate chat when booking ends
  static async deactivateChat(bookingId: string): Promise<void> {
    try {
      await Chat.findOneAndUpdate(
        { bookingId },
        { isActive: false }
      );
      console.log(`✅ Deactivated chat for booking ${bookingId}`);
    } catch (error) {
      console.error('❌ Error deactivating chat:', error);
    }
  }
}

export default ChatService;
