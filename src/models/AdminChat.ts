import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminMessage extends Document {
  chatId: mongoose.Types.ObjectId;
  senderId: string; // Clerk user ID
  senderType: 'admin' | 'owner';
  senderName: string;
  message: string;
  messageType: 'text' | 'image' | 'file';
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAdminChat extends Document {
  adminId: string; // Clerk user ID of admin
  ownerId: string; // Clerk user ID of house owner
  ownerName: string;
  ownerEmail: string;
  adminName: string;
  subject?: string;
  isActive: boolean;
  lastMessage?: string;
  lastMessageAt?: Date;
  lastMessageBy?: string;
  unreadCount: {
    admin: number;
    owner: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const adminMessageSchema = new Schema<IAdminMessage>({
  chatId: {
    type: Schema.Types.ObjectId,
    ref: 'AdminChat',
    required: [true, 'Chat ID is required'],
    index: true
  },
  senderId: {
    type: String,
    required: [true, 'Sender ID is required'],
    index: true
  },
  senderType: {
    type: String,
    enum: ['admin', 'owner'],
    required: [true, 'Sender type is required'],
    index: true
  },
  senderName: {
    type: String,
    required: [true, 'Sender name is required'],
    trim: true,
    maxlength: [100, 'Sender name cannot exceed 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true,
  collection: 'admin_messages'
});

const adminChatSchema = new Schema<IAdminChat>({
  adminId: {
    type: String,
    required: [true, 'Admin ID is required'],
    index: true
  },
  ownerId: {
    type: String,
    required: [true, 'Owner ID is required'],
    index: true
  },
  ownerName: {
    type: String,
    required: [true, 'Owner name is required'],
    trim: true,
    maxlength: [100, 'Owner name cannot exceed 100 characters']
  },
  ownerEmail: {
    type: String,
    required: [true, 'Owner email is required'],
    trim: true,
    lowercase: true
  },
  adminName: {
    type: String,
    required: [true, 'Admin name is required'],
    trim: true,
    maxlength: [100, 'Admin name cannot exceed 100 characters']
  },
  subject: {
    type: String,
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastMessage: {
    type: String,
    trim: true,
    maxlength: [200, 'Last message preview cannot exceed 200 characters']
  },
  lastMessageAt: {
    type: Date,
    index: true
  },
  lastMessageBy: {
    type: String,
    index: true
  },
  unreadCount: {
    admin: {
      type: Number,
      default: 0,
      min: 0
    },
    owner: {
      type: Number,
      default: 0,
      min: 0
    }
  }
}, {
  timestamps: true,
  collection: 'admin_chats'
});

// Indexes for efficient queries
adminChatSchema.index({ adminId: 1, isActive: 1 });
adminChatSchema.index({ ownerId: 1, isActive: 1 });
adminChatSchema.index({ lastMessageAt: -1 });
adminChatSchema.index({ adminId: 1, ownerId: 1 }, { unique: true }); // One chat per admin-owner pair

adminMessageSchema.index({ chatId: 1, createdAt: -1 });
adminMessageSchema.index({ senderId: 1, createdAt: -1 });
adminMessageSchema.index({ isRead: 1, chatId: 1 });

// Auto-delete old messages after 180 days (longer for admin chats)
adminMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const AdminMessage = mongoose.model<IAdminMessage>('AdminMessage', adminMessageSchema);
export const AdminChat = mongoose.model<IAdminChat>('AdminChat', adminChatSchema);

export default { AdminChat, AdminMessage };
