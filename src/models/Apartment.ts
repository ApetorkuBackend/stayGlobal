import mongoose, { Document, Schema } from 'mongoose';

export interface IApartment extends Document {
  title: string;
  description: string;
  location: {
    country: string;
    region: string;
    town: string;
    address: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  price: number;
  totalRooms: number;
  availableRooms: number;
  images: string[];
  amenities: string[];
  rating: number;
  reviews: number;
  ownerId: string; // Clerk user ID
  ownerName: string;
  ownerEmail: string;
  ownerPaymentAccount: {
    provider: 'paystack' | 'momo';
    subaccountCode?: string; // For Paystack
    accountNumber?: string;
    bankCode?: string;
    momoNumber?: string; // For Mobile Money
    momoProvider?: 'mtn' | 'vodafone' | 'airteltigo';
  };
  isActive: boolean;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

const ApartmentSchema: Schema = new Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: false, // Made optional for now
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  location: {
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true
    },
    region: {
      type: String,
      required: [true, 'Region is required'],
      trim: true
    },
    town: {
      type: String,
      required: [true, 'Town is required'],
      trim: true
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number }
    }
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  totalRooms: {
    type: Number,
    required: [true, 'Total rooms is required'],
    min: [1, 'Must have at least 1 room']
  },
  availableRooms: {
    type: Number,
    required: [true, 'Available rooms is required'],
    min: [0, 'Available rooms cannot be negative'],
    validate: {
      validator: function(this: IApartment, value: number) {
        return value <= this.totalRooms;
      },
      message: 'Available rooms cannot exceed total rooms'
    }
  },
  images: [{
    type: String,
    required: true
  }],
  amenities: [{
    type: String,
    enum: ['WiFi', 'Parking', 'Kitchen', 'AC', 'Pool', 'Gym', 'Laundry', 'Balcony', 'Garden', 'Security']
  }],
  rating: {
    type: Number,
    default: 0,
    min: [0, 'Rating cannot be negative'],
    max: [5, 'Rating cannot exceed 5']
  },
  reviews: {
    type: Number,
    default: 0,
    min: [0, 'Reviews count cannot be negative']
  },
  ownerId: {
    type: String,
    required: [true, 'Owner ID is required'],
    index: true
  },
  ownerName: {
    type: String,
    required: true,
    trim: true,
    default: 'Property Owner'
  },
  ownerEmail: {
    type: String,
    required: [true, 'Owner email is required'],
    trim: true,
    lowercase: true
  },
  ownerPaymentAccount: {
    provider: {
      type: String,
      enum: ['paystack', 'momo'],
      required: [true, 'Payment provider is required']
    },
    subaccountCode: {
      type: String,
      trim: true
    },
    accountNumber: {
      type: String,
      trim: true
    },
    bankCode: {
      type: String,
      trim: true
    },
    momoNumber: {
      type: String,
      trim: true
    },
    momoProvider: {
      type: String,
      enum: ['mtn', 'vodafone', 'airteltigo']
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
ApartmentSchema.index({ 'location.country': 1, 'location.region': 1, 'location.town': 1 });
ApartmentSchema.index({ price: 1 });
ApartmentSchema.index({ rating: -1 });
ApartmentSchema.index({ availableRooms: 1 });
ApartmentSchema.index({ ownerId: 1 });
ApartmentSchema.index({ status: 1 });
ApartmentSchema.index({ isActive: 1 });

export default mongoose.model<IApartment>('Apartment', ApartmentSchema);
