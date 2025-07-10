import mongoose, { Document, Schema } from 'mongoose';

export interface ICommission extends Document {
  bookingId: mongoose.Types.ObjectId;
  apartmentId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  guestId: mongoose.Types.ObjectId;
  roomPrice: number;
  commissionRate: number; // 5% = 0.05
  commissionAmount: number;
  bookingDate: Date;
  checkInDate: Date;
  checkOutDate: Date;
  status: 'pending' | 'paid' | 'failed';
  paymentDate?: Date;
  paymentReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionSchema = new Schema<ICommission>({
  bookingId: {
    type: Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  apartmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Apartment',
    required: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  guestId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  roomPrice: {
    type: Number,
    required: true,
    min: 0
  },
  commissionRate: {
    type: Number,
    required: true,
    default: 0.05, // 5%
    min: 0,
    max: 1
  },
  commissionAmount: {
    type: Number,
    required: true,
    min: 0
  },
  bookingDate: {
    type: Date,
    required: true
  },
  checkInDate: {
    type: Date,
    required: true
  },
  checkOutDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  paymentDate: {
    type: Date
  },
  paymentReference: {
    type: String
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for better query performance
CommissionSchema.index({ bookingId: 1 });
CommissionSchema.index({ apartmentId: 1 });
CommissionSchema.index({ ownerId: 1 });
CommissionSchema.index({ status: 1 });
CommissionSchema.index({ createdAt: -1 });
CommissionSchema.index({ bookingDate: -1 });

// Pre-save middleware to calculate commission amount
CommissionSchema.pre('save', function(this: ICommission, next) {
  if (this.isModified('roomPrice') || this.isModified('commissionRate')) {
    this.commissionAmount = this.roomPrice * this.commissionRate;
  }
  next();
});

// Static method to create commission from booking
CommissionSchema.statics.createFromBooking = async function(booking: any) {
  try {
    const commissionRate = 0.05; // 5%
    const commissionAmount = booking.totalAmount * commissionRate;

    const commission = new this({
      bookingId: booking._id,
      apartmentId: booking.apartmentId,
      ownerId: booking.apartmentId.ownerId, // Assuming apartment is populated
      guestId: booking.guestId,
      roomPrice: booking.totalAmount,
      commissionRate,
      commissionAmount,
      bookingDate: booking.createdAt,
      checkInDate: booking.checkIn,
      checkOutDate: booking.checkOut,
      status: 'pending'
    });

    await commission.save();
    console.log(`💰 Commission created for booking ${booking._id}: $${commissionAmount}`);
    return commission;
  } catch (error) {
    console.error('❌ Error creating commission:', error);
    throw error;
  }
};

// Instance method to mark as paid
CommissionSchema.methods.markAsPaid = function(paymentReference?: string) {
  this.status = 'paid';
  this.paymentDate = new Date();
  if (paymentReference) {
    this.paymentReference = paymentReference;
  }
  return this.save();
};

// Instance method to mark as failed
CommissionSchema.methods.markAsFailed = function(notes?: string) {
  this.status = 'failed';
  if (notes) {
    this.notes = notes;
  }
  return this.save();
};

// Virtual for commission percentage display
CommissionSchema.virtual('commissionPercentage').get(function(this: ICommission) {
  return (this.commissionRate * 100).toFixed(1) + '%';
});

// Virtual for formatted dates
CommissionSchema.virtual('formattedBookingDate').get(function(this: ICommission) {
  return this.bookingDate.toLocaleDateString();
});

CommissionSchema.virtual('formattedPaymentDate').get(function(this: ICommission) {
  return this.paymentDate ? this.paymentDate.toLocaleDateString() : null;
});

// Ensure virtual fields are serialized
CommissionSchema.set('toJSON', { virtuals: true });
CommissionSchema.set('toObject', { virtuals: true });

export default mongoose.model<ICommission>('Commission', CommissionSchema);
