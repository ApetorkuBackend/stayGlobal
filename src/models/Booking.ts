import mongoose, { Document, Schema } from 'mongoose';

export interface IBooking extends Document {
  apartmentId: mongoose.Types.ObjectId;
  guestId: string; // Clerk user ID
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  totalAmount: number;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentMethod: 'paystack' | 'momo' | 'card' | 'paypal' | 'bank_transfer';
  paymentDetails?: {
    // For mobile money
    momoNumber?: string;
    momoProvider?: 'mtn' | 'vodafone' | 'airteltigo';
    // For card
    useCard?: boolean;
  };
  paymentId?: mongoose.Types.ObjectId; // Reference to Payment document
  bookingStatus: 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'checked-in';
  ticketCode: string;
  roomNumber?: number; // Assigned room number
  checkInTime?: Date; // Actual check-in time
  checkOutTime?: Date; // Actual check-out time
  specialRequests?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema: Schema = new Schema({
  apartmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Apartment',
    required: [true, 'Apartment ID is required'],
    index: true
  },
  guestId: {
    type: String,
    required: [true, 'Guest ID is required'],
    index: true
  },
  guestName: {
    type: String,
    required: [true, 'Guest name is required'],
    trim: true
  },
  guestEmail: {
    type: String,
    required: [true, 'Guest email is required'],
    trim: true,
    lowercase: true
  },
  guestPhone: {
    type: String,
    required: false, // Made optional since users might not have phone in Clerk
    trim: true,
    default: ''
  },
  checkIn: {
    type: Date,
    required: [true, 'Check-in date is required']
  },
  checkOut: {
    type: Date,
    required: [true, 'Check-out date is required']
  },
  guests: {
    type: Number,
    required: [true, 'Number of guests is required'],
    min: [1, 'Must have at least 1 guest'],
    max: [20, 'Cannot exceed 20 guests']
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'not_required'],
    default: 'not_required',
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ['paystack', 'momo', 'card', 'paypal', 'bank_transfer', 'none'],
    default: 'none'
  },
  paymentDetails: {
    momoNumber: String,
    momoProvider: {
      type: String,
      enum: ['mtn', 'vodafone', 'airteltigo']
    },
    useCard: Boolean
  },
  paymentId: {
    type: Schema.Types.ObjectId,
    ref: 'Payment',
    index: true
  },
  bookingStatus: {
    type: String,
    enum: ['confirmed', 'cancelled', 'completed', 'no_show', 'checked-in'],
    default: 'confirmed',
    index: true
  },
  ticketCode: {
    type: String,
    required: [true, 'Ticket code is required'],
    unique: true,
    uppercase: true,
    index: true
  },
  roomNumber: {
    type: Number,
    min: [1, 'Room number must be positive'],
    index: true
  },
  checkInTime: {
    type: Date,
    index: true
  },
  checkOutTime: {
    type: Date,
    index: true
  },
  specialRequests: {
    type: String,
    trim: true,
    maxlength: [500, 'Special requests cannot exceed 500 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for booking duration in days
BookingSchema.virtual('duration').get(function(this: IBooking) {
  if (!this.checkOut || !this.checkIn) {
    return 0;
  }
  try {
    const checkOutTime = this.checkOut instanceof Date ? this.checkOut.getTime() : new Date(this.checkOut).getTime();
    const checkInTime = this.checkIn instanceof Date ? this.checkIn.getTime() : new Date(this.checkIn).getTime();
    const diffTime = Math.abs(checkOutTime - checkInTime);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch (error) {
    console.warn('Error calculating booking duration:', error);
    return 0;
  }
});

// Indexes for better query performance
BookingSchema.index({ apartmentId: 1, checkIn: 1, checkOut: 1 });
BookingSchema.index({ guestId: 1, createdAt: -1 });
BookingSchema.index({ ticketCode: 1 });
BookingSchema.index({ paymentStatus: 1 });
BookingSchema.index({ bookingStatus: 1 });

// Pre-save middleware to generate ticket code
BookingSchema.pre('save', function(this: IBooking, next) {
  if (!this.ticketCode) {
    this.ticketCode = generateTicketCode();
  }
  next();
});

function generateTicketCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default mongoose.model<IBooking>('Booking', BookingSchema);
