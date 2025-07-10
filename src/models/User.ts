import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'guest' | 'owner' | 'admin';
  status: 'active' | 'suspended';
  phone?: string;
  avatar?: string;
  preferences: {
    currency: string;
    language: string;
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
  };
  paymentAccount?: {
    provider: 'paystack' | 'momo';
    accountDetails: {
      // For Paystack
      subaccountCode?: string;
      bankCode?: string;
      accountNumber?: string;
      accountName?: string;
      // For Mobile Money
      momoNumber?: string;
      momoProvider?: 'mtn' | 'vodafone' | 'airteltigo';
    };
    isVerified: boolean;
    createdAt: Date;
  };
  identityVerification?: {
    isVerified: boolean;
    verificationId?: mongoose.Types.ObjectId;
    verifiedAt?: Date;
    verificationLevel: 'none' | 'id_submitted' | 'biometric_pending' | 'fully_verified' | 'rejected';
  };
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  fullName: string; // Virtual property
}

const UserSchema: Schema = new Schema({
  clerkId: {
    type: String,
    required: [true, 'Clerk ID is required'],
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  firstName: {
    type: String,
    default: '',
    trim: true
  },
  lastName: {
    type: String,
    default: '',
    trim: true
  },
  role: {
    type: String,
    enum: ['guest', 'owner', 'admin'],
    default: 'guest',
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active',
    index: true
  },
  phone: {
    type: String,
    trim: true
  },
  avatar: {
    type: String,
    trim: true
  },
  preferences: {
    currency: {
      type: String,
      default: 'GHS',
      enum: ['GHS', 'USD', 'EUR', 'GBP', 'CAD', 'AUD']
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it']
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      },
      push: {
        type: Boolean,
        default: true
      }
    }
  },
  paymentAccount: {
    provider: {
      type: String,
      enum: ['paystack', 'momo']
    },
    accountDetails: {
      subaccountCode: String,
      bankCode: String,
      accountNumber: String,
      accountName: String,
      momoNumber: String,
      momoProvider: {
        type: String,
        enum: ['mtn', 'vodafone', 'airteltigo']
      }
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  identityVerification: {
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationId: {
      type: Schema.Types.ObjectId,
      ref: 'IdentityVerification'
    },
    verifiedAt: {
      type: Date
    },
    verificationLevel: {
      type: String,
      enum: ['none', 'id_submitted', 'biometric_pending', 'fully_verified', 'rejected'],
      default: 'none'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
UserSchema.virtual('fullName').get(function(this: IUser) {
  return `${this.firstName} ${this.lastName}`;
});

// Indexes for better query performance
UserSchema.index({ clerkId: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });

export default mongoose.model<IUser>('User', UserSchema);
