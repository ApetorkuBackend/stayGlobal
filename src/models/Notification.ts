import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  userId: string; // Clerk user ID (house owner or admin)
  type: 'auto_checkout' | 'booking_reminder' | 'payment_received' | 'system_alert' | 'new_message' | 'checkout_reminder' | 'new_apartment' | 'new_booking' | 'verification_submitted' | 'admin_message' | 'payment_issue';
  title: string;
  message: string;
  bookingId?: mongoose.Types.ObjectId;
  apartmentId?: mongoose.Types.ObjectId;
  guestName?: string;
  roomNumber?: number;
  ownerId?: string; // For admin notifications about owners
  ownerName?: string; // For admin notifications about owners
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  readAt?: Date;
}

const notificationSchema = new Schema<INotification>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true
  },
  type: {
    type: String,
    enum: ['auto_checkout', 'booking_reminder', 'payment_received', 'system_alert', 'new_message', 'checkout_reminder', 'new_apartment', 'new_booking', 'verification_submitted', 'admin_message', 'payment_issue'],
    required: [true, 'Notification type is required'],
    index: true
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  bookingId: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
    index: true
  },
  apartmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Apartment',
    index: true
  },
  guestName: {
    type: String,
    trim: true,
    maxlength: [100, 'Guest name cannot exceed 100 characters']
  },
  roomNumber: {
    type: Number,
    min: [1, 'Room number must be positive']
  },
  ownerId: {
    type: String,
    trim: true,
    maxlength: [100, 'Owner ID cannot exceed 100 characters']
  },
  ownerName: {
    type: String,
    trim: true,
    maxlength: [100, 'Owner name cannot exceed 100 characters']
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
    index: true
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true,
  collection: 'notifications'
});

// Indexes for efficient queries
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

// Auto-delete old notifications after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model<INotification>('Notification', notificationSchema);
