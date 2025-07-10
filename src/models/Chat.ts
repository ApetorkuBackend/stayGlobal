import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  chatId: mongoose.Types.ObjectId;
  senderId: string; // Clerk user ID
  senderType: 'owner' | 'renter';
  message: string;
  messageType: 'text' | 'image' | 'file';
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChat extends Document {
  bookingId: mongoose.Types.ObjectId;
  apartmentId: mongoose.Types.ObjectId;
  ownerId: string; // Clerk user ID of house owner
  renterId: string; // Clerk user ID of renter
  renterName: string;
  ownerName: string;
  apartmentTitle: string;
  roomNumber?: number;
  isActive: boolean;
  lastMessage?: string;
  lastMessageAt?: Date;
  lastMessageBy?: string;
  unreadCount: {
    owner: number;
    renter: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>({
  chatId: {
    type: Schema.Types.ObjectId,
    ref: 'Chat',
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
    enum: ['owner', 'renter'],
    required: [true, 'Sender type is required'],
    index: true
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
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
  collection: 'messages'
});

const chatSchema = new Schema<IChat>({
  bookingId: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
    required: [true, 'Booking ID is required'],
    unique: true,
    index: true
  },
  apartmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Apartment',
    required: [true, 'Apartment ID is required'],
    index: true
  },
  ownerId: {
    type: String,
    required: [true, 'Owner ID is required'],
    index: true
  },
  renterId: {
    type: String,
    required: [true, 'Renter ID is required'],
    index: true
  },
  renterName: {
    type: String,
    required: [true, 'Renter name is required'],
    trim: true,
    maxlength: [100, 'Renter name cannot exceed 100 characters']
  },
  ownerName: {
    type: String,
    required: [true, 'Owner name is required'],
    trim: true,
    maxlength: [100, 'Owner name cannot exceed 100 characters']
  },
  apartmentTitle: {
    type: String,
    required: [true, 'Apartment title is required'],
    trim: true,
    maxlength: [200, 'Apartment title cannot exceed 200 characters']
  },
  roomNumber: {
    type: Number,
    min: [1, 'Room number must be positive']
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
    owner: {
      type: Number,
      default: 0,
      min: 0
    },
    renter: {
      type: Number,
      default: 0,
      min: 0
    }
  }
}, {
  timestamps: true,
  collection: 'chats'
});

// Indexes for efficient queries
chatSchema.index({ ownerId: 1, isActive: 1 });
chatSchema.index({ renterId: 1, isActive: 1 });
chatSchema.index({ bookingId: 1, isActive: 1 });
chatSchema.index({ lastMessageAt: -1 });

messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ isRead: 1, chatId: 1 });

// Auto-delete old messages after 90 days
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Message = mongoose.model<IMessage>('Message', messageSchema);
export const Chat = mongoose.model<IChat>('Chat', chatSchema);

export default { Chat, Message };
