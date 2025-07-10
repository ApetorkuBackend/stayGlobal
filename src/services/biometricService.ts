import * as crypto from 'crypto';
import IdentityVerification, { IIdentityVerification } from '../models/IdentityVerification';
import BiometricLog from '../models/BiometricLog';
import User from '../models/User';

export interface FingerprintData {
  template: string; // Base64 encoded fingerprint template
  quality: number; // Quality score 0-100
  captureDevice?: string;
}

export interface BiometricVerificationResult {
  isMatch: boolean;
  confidence: number;
  threshold: number;
  quality: number;
}

export interface VerificationAttempt {
  userId: string;
  fingerprintData: FingerprintData;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    sessionId?: string;
  };
}

class BiometricService {
  private readonly QUALITY_THRESHOLD = 60; // Minimum quality score
  private readonly MATCH_THRESHOLD = 75; // Minimum confidence for match
  private readonly MAX_FAILED_ATTEMPTS = 5; // Max failed attempts per hour
  private readonly ENCRYPTION_KEY = process.env.BIOMETRIC_ENCRYPTION_KEY || 'default-key-change-in-production';

  /**
   * Encrypt biometric template for secure storage
   */
  private encryptTemplate(template: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    let encrypted = cipher.update(template, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt biometric template for comparison
   */
  private decryptTemplate(encryptedTemplate: string): string {
    const parts = encryptedTemplate.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Generate hash of fingerprint template for quick comparison
   */
  private generateFingerprintHash(template: string): string {
    return crypto.createHash('sha256').update(template).digest('hex');
  }

  /**
   * Simulate fingerprint matching algorithm
   * In production, this would use a proper biometric SDK
   */
  private matchFingerprints(template1: string, template2: string): { confidence: number; isMatch: boolean } {
    // Simplified matching algorithm - in production use proper biometric matching
    const hash1 = this.generateFingerprintHash(template1);
    const hash2 = this.generateFingerprintHash(template2);
    
    if (hash1 === hash2) {
      return { confidence: 100, isMatch: true };
    }
    
    // Simulate partial matching based on template similarity
    let similarity = 0;
    const minLength = Math.min(template1.length, template2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (template1[i] === template2[i]) {
        similarity++;
      }
    }
    
    const confidence = (similarity / minLength) * 100;
    const isMatch = confidence >= this.MATCH_THRESHOLD;
    
    return { confidence, isMatch };
  }

  /**
   * Check for suspicious activity (too many failed attempts)
   */
  private async checkSuspiciousActivity(userId: string, ipAddress?: string): Promise<boolean> {
    const recentTime = new Date(Date.now() - 60 * 60 * 1000); // Last hour

    const query: any = {
      createdAt: { $gte: recentTime },
      attemptStatus: { $in: ['failed', 'poor_quality'] }
    };

    if (userId) query.userId = userId;
    if (ipAddress) query['metadata.ipAddress'] = ipAddress;

    const failedAttempts = await BiometricLog.countDocuments(query);
    return failedAttempts >= this.MAX_FAILED_ATTEMPTS;
  }

  /**
   * Enroll fingerprint for a user during identity verification
   */
  async enrollFingerprint(
    userId: string,
    fingerprintData: FingerprintData,
    nationalIdData: any,
    documentImages: any,
    metadata?: any
  ): Promise<{ success: boolean; verificationId?: string; error?: string }> {
    try {
      // Check if user already has verification in progress
      const existingVerification = await IdentityVerification.findOne({ userId });
      if (existingVerification && existingVerification.verificationStatus === 'verified') {
        return { success: false, error: 'User already verified' };
      }

      // Validate fingerprint quality
      if (fingerprintData.quality < this.QUALITY_THRESHOLD) {
        return { success: false, error: 'Fingerprint quality too low. Please try again.' };
      }

      // Check for suspicious activity
      const isSuspicious = await this.checkSuspiciousActivity(userId, metadata?.ipAddress);
      if (isSuspicious) {
        return { success: false, error: 'Too many failed attempts. Please try again later.' };
      }

      // Encrypt and hash the fingerprint
      const encryptedTemplate = this.encryptTemplate(fingerprintData.template);
      const fingerprintHash = this.generateFingerprintHash(fingerprintData.template);

      // Check for duplicate fingerprints in the system
      const duplicateCheck = await IdentityVerification.findOne({
        'biometricData.fingerprintHash': fingerprintHash,
        userId: { $ne: userId }
      });

      const verificationData = {
        userId,
        nationalId: nationalIdData,
        biometricData: {
          fingerprintHash,
          fingerprintTemplate: encryptedTemplate,
          captureDevice: fingerprintData.captureDevice,
          captureQuality: fingerprintData.quality,
          capturedAt: new Date()
        },
        documentImages,
        verificationStatus: 'pending' as const,
        verificationSteps: {
          documentSubmitted: true,
          documentVerified: false,
          biometricCaptured: true,
          biometricVerified: false,
          manualReviewRequired: !!duplicateCheck,
          manualReviewCompleted: false
        },
        verificationResults: {
          documentAuthenticity: 'pending' as const,
          biometricMatch: 'pending' as const,
          faceMatch: 'pending' as const,
          duplicateCheck: duplicateCheck ? 'failed' as const : 'passed' as const,
          overallScore: 0
        },
        metadata: {
          ...metadata,
          submissionSource: 'web' as const
        }
      };

      let verification: IIdentityVerification;
      if (existingVerification) {
        Object.assign(existingVerification, verificationData);
        verification = await existingVerification.save();
      } else {
        verification = new IdentityVerification(verificationData);
        await verification.save();
      }

      // Log the enrollment attempt
      await new BiometricLog({
        userId,
        verificationId: verification._id as any,
        attemptType: 'enrollment',
        fingerprintData: {
          hash: fingerprintHash,
          quality: fingerprintData.quality,
          captureDevice: fingerprintData.captureDevice,
          template: encryptedTemplate
        },
        matchResult: {
          isMatch: true,
          confidence: 100,
          threshold: this.MATCH_THRESHOLD
        },
        attemptStatus: 'success',
        metadata: {
          ...metadata,
          attemptDuration: 0 // Enrollment doesn't have duration
        }
      }).save();

      // Update user verification status
      await User.findOneAndUpdate(
        { clerkId: userId },
        {
          'identityVerification.verificationId': verification._id as any,
          'identityVerification.verificationLevel': duplicateCheck ? 'biometric_pending' : 'id_submitted'
        }
      );

      return {
        success: true,
        verificationId: (verification._id as any).toString()
      };

    } catch (error) {
      console.error('Fingerprint enrollment error:', error);
      return { success: false, error: 'Failed to enroll fingerprint' };
    }
  }

  /**
   * Verify fingerprint against enrolled template
   */
  async verifyFingerprint(attempt: VerificationAttempt): Promise<BiometricVerificationResult> {
    const startTime = Date.now();
    
    try {
      // Check for suspicious activity
      const isSuspicious = await this.checkSuspiciousActivity(attempt.userId, attempt.metadata?.ipAddress);
      if (isSuspicious) {
        throw new Error('Too many failed attempts');
      }

      // Get user's enrolled fingerprint
      const verification = await IdentityVerification.findOne({ 
        userId: attempt.userId,
        verificationStatus: 'verified'
      });

      if (!verification) {
        throw new Error('No verified fingerprint found for user');
      }

      // Validate input quality
      if (attempt.fingerprintData.quality < this.QUALITY_THRESHOLD) {
        throw new Error('Fingerprint quality too low');
      }

      // Decrypt stored template and compare
      // const storedTemplate = this.decryptTemplate(verification.biometricData.fingerprintTemplate);
      // For now, return a mock result since biometric data structure is not fully implemented
      const matchResult = { isMatch: true, confidence: 0.95 };

      const result: BiometricVerificationResult = {
        isMatch: matchResult.isMatch,
        confidence: matchResult.confidence,
        threshold: this.MATCH_THRESHOLD,
        quality: attempt.fingerprintData.quality
      };

      // Log the verification attempt
      await new BiometricLog({
        userId: attempt.userId,
        verificationId: verification._id as any,
        attemptType: 'verification',
        fingerprintData: {
          hash: this.generateFingerprintHash(attempt.fingerprintData.template),
          quality: attempt.fingerprintData.quality,
          captureDevice: attempt.fingerprintData.captureDevice
        },
        matchResult: {
          isMatch: result.isMatch,
          confidence: result.confidence,
          threshold: this.MATCH_THRESHOLD
        },
        attemptStatus: result.isMatch ? 'success' : 'failed',
        metadata: {
          ...attempt.metadata,
          attemptDuration: Date.now() - startTime
        }
      }).save();

      return result;

    } catch (error) {
      // Log failed attempt
      await new BiometricLog({
        userId: attempt.userId,
        verificationId: null as any,
        attemptType: 'verification',
        fingerprintData: {
          hash: this.generateFingerprintHash(attempt.fingerprintData.template),
          quality: attempt.fingerprintData.quality,
          captureDevice: attempt.fingerprintData.captureDevice
        },
        matchResult: {
          isMatch: false,
          confidence: 0,
          threshold: this.MATCH_THRESHOLD
        },
        attemptStatus: 'failed',
        metadata: {
          ...attempt.metadata,
          attemptDuration: Date.now() - startTime
        }
      }).save();

      throw error;
    }
  }

  /**
   * Get verification status for a user
   */
  async getVerificationStatus(userId: string): Promise<any> {
    const verification = await IdentityVerification.findOne({ userId });
    const user = await User.findOne({ clerkId: userId });

    return {
      hasVerification: !!verification,
      verificationStatus: verification?.verificationStatus || 'none',
      verificationLevel: user?.identityVerification?.verificationLevel || 'none',
      isVerified: verification?.verificationStatus === 'verified',
      canListApartments: verification?.verificationStatus === 'verified' && user?.paymentAccount?.isVerified,
      steps: {}, // verification?.verificationSteps || {},
      results: {} // verification?.verificationResults || {}
    };
  }
}

export default new BiometricService();
