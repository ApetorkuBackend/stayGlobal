import mongoose, { Document, Schema } from 'mongoose';

export interface IPayment extends Document {
  bookingId: mongoose.Types.ObjectId;
  payerId: string; // Clerk user ID of the person paying
  payeeId: string; // Clerk user ID of the apartment owner
  apartmentId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  paymentMethod: 'paystack' | 'momo';
  
  // Paystack specific fields
  paystackReference?: string;
  paystackTransactionId?: string;
  paystackSubaccountCode?: string;
  
  // Mobile Money specific fields
  momoReference?: string;
  momoProvider?: 'mtn' | 'vodafone' | 'airteltigo';
  momoNumber?: string;
  
  status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled' | 'refunded';
  failureReason?: string;
  
  // Split payment details
  platformFee: number; // Our commission
  ownerAmount: number; // Amount that goes to the owner
  
  // Timestamps
  initiatedAt: Date;
  completedAt?: Date;
  refundedAt?: Date;
  
  // Metadata
  metadata?: {
    checkIn: Date;
    checkOut: Date;
    guests: number;
    apartmentTitle: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
  bookingId: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
    required: [true, 'Booking ID is required'],
    index: true
  },
  payerId: {
    type: String,
    required: [true, 'Payer ID is required'],
    index: true
  },
  payeeId: {
    type: String,
    required: [true, 'Payee ID is required'],
    index: true
  },
  apartmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Apartment',
    required: [true, 'Apartment ID is required'],
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    default: 'GHS',
    enum: ['GHS', 'USD', 'EUR', 'GBP']
  },
  paymentMethod: {
    type: String,
    required: [true, 'Payment method is required'],
    enum: ['paystack', 'momo']
  },
  
  // Paystack fields
  paystackReference: {
    type: String,
    index: true
  },
  paystackTransactionId: {
    type: String,
    index: true
  },
  paystackSubaccountCode: {
    type: String
  },
  
  // Mobile Money fields
  momoReference: {
    type: String,
    index: true
  },
  momoProvider: {
    type: String,
    enum: ['mtn', 'vodafone', 'airteltigo']
  },
  momoNumber: {
    type: String
  },
  
  status: {
    type: String,
    enum: ['pending', 'processing', 'success', 'failed', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },
  failureReason: {
    type: String
  },
  
  // Split payment
  platformFee: {
    type: Number,
    required: [true, 'Platform fee is required'],
    min: [0, 'Platform fee cannot be negative']
  },
  ownerAmount: {
    type: Number,
    required: [true, 'Owner amount is required'],
    min: [0, 'Owner amount cannot be negative']
  },
  
  // Timestamps
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  refundedAt: {
    type: Date
  },
  
  // Metadata
  metadata: {
    checkIn: Date,
    checkOut: Date,
    guests: Number,
    apartmentTitle: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
PaymentSchema.index({ bookingId: 1 });
PaymentSchema.index({ payerId: 1, createdAt: -1 });
PaymentSchema.index({ payeeId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ paystackReference: 1 });
PaymentSchema.index({ momoReference: 1 });

// Virtual for payment duration
PaymentSchema.virtual('processingTime').get(function(this: IPayment) {
  if (this.completedAt && this.initiatedAt) {
    return this.completedAt.getTime() - this.initiatedAt.getTime();
  }
  return null;
});

export default mongoose.model<IPayment>('Payment', PaymentSchema);
