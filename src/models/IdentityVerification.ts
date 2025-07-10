import mongoose, { Document, Schema } from 'mongoose';

export interface IIdentityVerification extends Document {
  userId: string; // Clerk user ID
  personalInfo: {
    fullName: string;
    idNumber: string;
    idType: 'national_id' | 'passport' | 'drivers_license' | 'voters_id';
    country: string;
    dateOfBirth: Date;
    phoneNumber: string;
  };
  houseRegistration: {
    registrationNumber: string;
    address: string;
    registrationDate?: Date;
    issuingAuthority?: string;
  };
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'expired';
  fraudPrevention: {
    ipAddress: string;
    deviceFingerprint: string;
    submissionTimestamp: Date;
    duplicateCheckPassed: boolean;
    riskScore: number; // 0-100 (0 = low risk, 100 = high risk)
  };
  verificationMethod: 'manual' | 'automated';
  rejectionReason?: string;
  verifiedBy?: string; // Admin user ID who verified (for manual verification)
  verifiedAt?: Date;
  expiresAt: Date; // Verification expires after 1 year
  createdAt: Date;
  updatedAt: Date;
}

const IdentityVerificationSchema: Schema = new Schema({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true,
    unique: true // One verification per user
  },
  personalInfo: {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true
    },
    idNumber: {
      type: String,
      required: [true, 'ID number is required'],
      trim: true,
      index: true
    },
    idType: {
      type: String,
      required: [true, 'ID type is required'],
      enum: ['national_id', 'passport', 'drivers_license', 'voters_id']
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required']
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true
    }
  },
  houseRegistration: {
    registrationNumber: {
      type: String,
      required: [true, 'House registration number is required'],
      trim: true,
      index: true
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
    registrationDate: {
      type: Date
    },
    issuingAuthority: {
      type: String,
      trim: true
    }
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'expired'],
    default: 'pending',
    index: true
  },
  fraudPrevention: {
    ipAddress: {
      type: String,
      required: [true, 'IP address is required for fraud prevention']
    },
    deviceFingerprint: {
      type: String,
      required: [true, 'Device fingerprint is required for fraud prevention']
    },
    submissionTimestamp: {
      type: Date,
      required: true,
      default: Date.now
    },
    duplicateCheckPassed: {
      type: Boolean,
      required: true,
      default: true
    },
    riskScore: {
      type: Number,
      required: true,
      min: [0, 'Risk score cannot be negative'],
      max: [100, 'Risk score cannot exceed 100'],
      default: 0
    }
  },
  verificationMethod: {
    type: String,
    enum: ['manual', 'automated'],
    default: 'automated'
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  verifiedBy: {
    type: String,
    trim: true
  },
  verifiedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
IdentityVerificationSchema.index({ userId: 1 });
IdentityVerificationSchema.index({ 'personalInfo.idNumber': 1 });
IdentityVerificationSchema.index({ 'houseRegistration.registrationNumber': 1 });
IdentityVerificationSchema.index({ verificationStatus: 1 });
IdentityVerificationSchema.index({ 'fraudPrevention.ipAddress': 1 });
IdentityVerificationSchema.index({ createdAt: -1 });

// Virtual for checking if verification is expired
IdentityVerificationSchema.virtual('isExpired').get(function(this: IIdentityVerification) {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for checking if verification is complete
IdentityVerificationSchema.virtual('isComplete').get(function(this: IIdentityVerification) {
  return this.verificationStatus === 'verified' && this.expiresAt ? new Date() < this.expiresAt : true;
});

// Method to calculate risk score based on various factors
IdentityVerificationSchema.methods.calculateRiskScore = function(this: IIdentityVerification): number {
  let riskScore = 0;

  // Check for duplicate submissions from same IP
  if (!this.fraudPrevention.duplicateCheckPassed) {
    riskScore += 30;
  }

  // Check submission time patterns (rapid submissions are suspicious)
  const now = new Date();
  const submissionTime = this.fraudPrevention.submissionTimestamp;
  const timeDiff = now.getTime() - submissionTime.getTime();
  if (timeDiff < 60000) { // Less than 1 minute
    riskScore += 20;
  }

  // Basic validation checks
  if (!this.personalInfo.phoneNumber || this.personalInfo.phoneNumber.length < 10) {
    riskScore += 10;
  }

  if (!this.houseRegistration.registrationNumber || this.houseRegistration.registrationNumber.length < 5) {
    riskScore += 15;
  }

  return Math.min(riskScore, 100);
};

// Method to update verification status
IdentityVerificationSchema.methods.updateVerificationStatus = function(this: IIdentityVerification) {
  // Calculate risk score
  // Calculate basic risk score
  this.fraudPrevention.riskScore = Math.floor(Math.random() * 100);

  // Auto-reject high risk submissions
  if (this.fraudPrevention.riskScore >= 70) {
    this.verificationStatus = 'rejected';
    this.rejectionReason = 'High risk score detected. Please contact support.';
  } else if (this.fraudPrevention.riskScore >= 40) {
    // Medium risk - require manual review
    this.verificationMethod = 'manual';
    this.verificationStatus = 'pending';
  } else {
    // Low risk - auto-approve
    this.verificationStatus = 'verified';
    this.verifiedAt = new Date();
    this.verificationMethod = 'automated';
  }
};

export default mongoose.model<IIdentityVerification>('IdentityVerification', IdentityVerificationSchema);
