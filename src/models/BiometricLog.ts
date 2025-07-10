import mongoose, { Document, Schema } from 'mongoose';

export interface IBiometricLog extends Document {
  userId: string; // Clerk user ID
  verificationId: mongoose.Types.ObjectId;
  attemptType: 'enrollment' | 'verification' | 'authentication';
  fingerprintData: {
    hash: string;
    quality: number;
    captureDevice?: string;
    template?: string; // Encrypted template
  };
  matchResult: {
    isMatch: boolean;
    confidence: number; // 0-100
    threshold: number; // Minimum confidence required
  };
  attemptStatus: 'success' | 'failed' | 'poor_quality' | 'timeout' | 'device_error';
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    sessionId?: string;
    attemptDuration: number; // milliseconds
  };
  createdAt: Date;
}

const BiometricLogSchema: Schema = new Schema({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true
  },
  verificationId: {
    type: Schema.Types.ObjectId,
    ref: 'IdentityVerification',
    required: [true, 'Verification ID is required'],
    index: true
  },
  attemptType: {
    type: String,
    required: [true, 'Attempt type is required'],
    enum: ['enrollment', 'verification', 'authentication']
  },
  fingerprintData: {
    hash: {
      type: String,
      required: [true, 'Fingerprint hash is required']
    },
    quality: {
      type: Number,
      required: [true, 'Quality score is required'],
      min: [0, 'Quality cannot be negative'],
      max: [100, 'Quality cannot exceed 100']
    },
    captureDevice: {
      type: String,
      trim: true
    },
    template: {
      type: String // Encrypted biometric template
    }
  },
  matchResult: {
    isMatch: {
      type: Boolean,
      required: [true, 'Match result is required']
    },
    confidence: {
      type: Number,
      required: [true, 'Confidence score is required'],
      min: [0, 'Confidence cannot be negative'],
      max: [100, 'Confidence cannot exceed 100']
    },
    threshold: {
      type: Number,
      required: [true, 'Threshold is required'],
      min: [0, 'Threshold cannot be negative'],
      max: [100, 'Threshold cannot exceed 100'],
      default: 75 // Default threshold of 75%
    }
  },
  attemptStatus: {
    type: String,
    required: [true, 'Attempt status is required'],
    enum: ['success', 'failed', 'poor_quality', 'timeout', 'device_error'],
    index: true
  },
  metadata: {
    ipAddress: {
      type: String,
      trim: true
    },
    userAgent: {
      type: String,
      trim: true
    },
    deviceFingerprint: {
      type: String,
      trim: true
    },
    sessionId: {
      type: String,
      trim: true
    },
    attemptDuration: {
      type: Number,
      required: [true, 'Attempt duration is required'],
      min: [0, 'Duration cannot be negative']
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance and security monitoring
BiometricLogSchema.index({ userId: 1, createdAt: -1 });
BiometricLogSchema.index({ verificationId: 1 });
BiometricLogSchema.index({ attemptStatus: 1, createdAt: -1 });
BiometricLogSchema.index({ 'metadata.ipAddress': 1, createdAt: -1 });

// Virtual for checking if attempt was successful
BiometricLogSchema.virtual('isSuccessful').get(function(this: IBiometricLog) {
  return this.attemptStatus === 'success' && this.matchResult.isMatch;
});

// Static method to get recent failed attempts for security monitoring
BiometricLogSchema.statics.getRecentFailedAttempts = function(userId: string, hours: number = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    userId,
    attemptStatus: 'failed',
    createdAt: { $gte: since }
  }).sort({ createdAt: -1 });
};

// Static method to check for suspicious activity
BiometricLogSchema.statics.checkSuspiciousActivity = function(userId: string, ipAddress?: string) {
  const recentTime = new Date(Date.now() - 60 * 60 * 1000); // Last hour
  
  const query: any = {
    createdAt: { $gte: recentTime },
    attemptStatus: { $in: ['failed', 'poor_quality'] }
  };
  
  if (userId) query.userId = userId;
  if (ipAddress) query['metadata.ipAddress'] = ipAddress;
  
  return this.countDocuments(query);
};

export default mongoose.model<IBiometricLog>('BiometricLog', BiometricLogSchema);
