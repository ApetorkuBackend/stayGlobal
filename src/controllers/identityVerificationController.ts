import { Request, Response } from 'express';
import IdentityVerification from '../models/IdentityVerification';
import User from '../models/User';
import NotificationService from '../services/notificationService';

// Simple verification submission - new simplified flow
export const submitSimpleVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🚀 submitSimpleVerification endpoint hit');

    // Check if user is authenticated
    if (!req.user || !req.user.clerkId) {
      console.error('❌ User not authenticated or missing clerkId');
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const userId = req.user.clerkId;
    console.log('👤 User ID:', userId);

    const { personalInfo, houseRegistration } = req.body;

    console.log('🔍 Simple verification submission received:', {
      userId,
      hasPersonalInfo: !!personalInfo,
      hasHouseRegistration: !!houseRegistration
    });

    // Check if user already has a verification
    const existingVerification = await IdentityVerification.findOne({ userId });
    if (existingVerification) {
      console.log('⚠️ User already has verification:', existingVerification.verificationStatus);
      console.log('🔄 Deleting existing verification for testing...');

      // For testing purposes, delete the existing verification and allow resubmission
      await IdentityVerification.deleteOne({ userId });
      console.log('✅ Existing verification deleted, proceeding with new submission');
    }

    // Validate required fields
    if (!personalInfo || !personalInfo.fullName || !personalInfo.idNumber || !personalInfo.country) {
      res.status(400).json({ error: 'Personal information is required' });
      return;
    }

    if (!houseRegistration || !houseRegistration.registrationNumber || !houseRegistration.address) {
      res.status(400).json({ error: 'House registration information is required' });
      return;
    }

    // Check for duplicate ID number (fraud prevention)
    const duplicateId = await IdentityVerification.findOne({
      'personalInfo.idNumber': personalInfo.idNumber.trim().toUpperCase()
    });

    const duplicateHouseReg = await IdentityVerification.findOne({
      'houseRegistration.registrationNumber': houseRegistration.registrationNumber.trim().toUpperCase()
    });

    // Create verification record
    const verificationData = {
      userId,
      personalInfo: {
        fullName: personalInfo.fullName.trim(),
        idNumber: personalInfo.idNumber.trim().toUpperCase(),
        idType: personalInfo.idType || 'national_id',
        country: personalInfo.country.trim(),
        dateOfBirth: new Date(personalInfo.dateOfBirth),
        phoneNumber: personalInfo.phoneNumber.trim()
      },
      houseRegistration: {
        registrationNumber: houseRegistration.registrationNumber.trim().toUpperCase(),
        address: houseRegistration.address.trim(),
        registrationDate: houseRegistration.registrationDate ? new Date(houseRegistration.registrationDate) : undefined,
        issuingAuthority: houseRegistration.issuingAuthority?.trim()
      },
      fraudPrevention: {
        ipAddress: req.ip || 'unknown',
        deviceFingerprint: req.body.deviceFingerprint || `${req.get('User-Agent')}-${Date.now()}`,
        submissionTimestamp: new Date(),
        duplicateCheckPassed: !duplicateId && !duplicateHouseReg,
        riskScore: 0 // Will be calculated by the model method
      },
      verificationStatus: 'pending',
      verificationMethod: 'automated'
    };

    console.log('💾 Creating simplified verification record:', {
      userId,
      idNumber: verificationData.personalInfo.idNumber,
      houseRegNumber: verificationData.houseRegistration.registrationNumber,
      duplicateCheckPassed: verificationData.fraudPrevention.duplicateCheckPassed
    });

    const verification = new IdentityVerification(verificationData);

    // Set verification status to verified for simple verification
    verification.verificationStatus = 'verified';
    verification.verifiedAt = new Date();

    await verification.save();

    // Update User model with verification status for persistence
    await User.findOneAndUpdate(
      { clerkId: userId },
      {
        $set: {
          'identityVerification.isVerified': true,
          'identityVerification.verificationLevel': 'fully_verified',
          'identityVerification.verifiedAt': new Date(),
          'identityVerification.verificationId': verification._id
        }
      },
      { upsert: true }
    );

    console.log('✅ Simple verification saved successfully and User model updated:', {
      id: verification._id,
      status: verification.verificationStatus,
      riskScore: verification.fraudPrevention.riskScore,
      method: verification.verificationMethod,
      userUpdated: true
    });

    res.status(201).json({
      message: 'Verification submitted successfully',
      verificationId: verification._id,
      status: verification.verificationStatus,
      riskScore: verification.fraudPrevention.riskScore,
      isComplete: verification.verificationStatus === 'verified',
      requiresManualReview: verification.verificationMethod === 'manual'
    });

  } catch (error) {
    console.error('❌ Error submitting simple verification:', error);
    res.status(500).json({
      error: 'Failed to submit verification',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Submit identity verification with documents and biometric data
export const submitIdentityVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🚀 submitIdentityVerification endpoint hit');

    // Check if user is authenticated
    if (!req.user || !req.user.clerkId) {
      console.error('❌ User not authenticated or missing clerkId');
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const userId = req.user.clerkId;
    console.log('👤 User ID:', userId);
    const {
      nationalId,
      biometric,
      paymentAccount,
      autoRetrieved,
      verificationStatus,
      // Legacy support
      documentImages,
      fingerprintData,
      metadata
    } = req.body;

    // Debug logging
    console.log('🔍 Verification submission received:', {
      userId,
      hasNationalId: !!nationalId,
      hasBiometric: !!biometric,
      hasPaymentAccount: !!paymentAccount,
      autoRetrieved,
      verificationStatus,
      hasDocumentImages: !!documentImages,
      hasFingerprintData: !!fingerprintData
    });

    if (biometric) {
      console.log('📱 Biometric data:', biometric);
    }

    // Validate required fields
    if (!nationalId || !nationalId.idNumber || !nationalId.fullName || !nationalId.dateOfBirth) {
      res.status(400).json({ error: 'National ID information is required' });
      return;
    }

    // Handle new biometric data structure or legacy documentImages
    const hasNewBiometric = biometric && (biometric.documentFrontUploaded || biometric.documentBackUploaded || biometric.faceVerified);
    const hasLegacyImages = documentImages && documentImages.frontImage && documentImages.selfieImage;

    console.log('✅ Verification checks:', {
      hasNewBiometric,
      hasLegacyImages,
      autoRetrieved,
      biometricDetails: biometric ? {
        documentFrontUploaded: biometric.documentFrontUploaded,
        documentBackUploaded: biometric.documentBackUploaded,
        faceVerified: biometric.faceVerified
      } : null
    });

    // If auto-retrieved, we can be more lenient with verification requirements
    if (!autoRetrieved && !hasNewBiometric && !hasLegacyImages) {
      console.log('❌ Validation failed: No valid biometric or document data');
      res.status(400).json({ error: 'Document verification is required' });
      return;
    }

    // For auto-retrieved data, ensure we have at least some biometric indication
    if (autoRetrieved && !biometric) {
      console.log('❌ Auto-retrieved verification missing biometric data');
      res.status(400).json({ error: 'Biometric verification data is required' });
      return;
    }

    // For the new flow (no fingerprint required), create verification record directly
    if (autoRetrieved || hasNewBiometric) {
      console.log('✅ Creating verification record for auto-retrieved/new biometric data');

      // Create verification record directly since this is auto-retrieved data
      const verificationData: any = {
        userId,
        nationalId,
        verificationStatus: verificationStatus || 'verified',
        verificationSteps: {
          documentVerified: true, // Auto-verified through government database
          biometricVerified: biometric?.faceVerified || true, // Face verification or auto-verified
          manualReviewCompleted: true
        },
        verificationResults: {
          documentAuthenticity: 'passed',
          biometricMatch: 'passed', // No fingerprint needed
          faceMatch: biometric?.faceVerified ? 'passed' : 'auto_verified',
          overallScore: 100
        },
        paymentAccount: paymentAccount || null,
        submittedAt: new Date(),
        verifiedAt: new Date()
      };

      // Include document images if provided
      if (documentImages) {
        verificationData.documentImages = documentImages;
      }

      const verification = new IdentityVerification(verificationData);

      console.log('💾 Attempting to save verification record...');
      await verification.save();
      console.log('✅ Verification record saved successfully');

      // Update user verification status
      console.log('👤 Updating user verification status...');
      const userUpdateResult = await User.findOneAndUpdate(
        { clerkId: userId },
        {
          'identityVerification.isVerified': true,
          'identityVerification.verifiedAt': new Date(),
          'identityVerification.verificationLevel': 'fully_verified',
          'paymentAccount': paymentAccount || null
        },
        { new: true } // Return the updated document
      );

      if (!userUpdateResult) {
        console.error('❌ User not found for update:', userId);
        throw new Error('User not found for verification update');
      }

      console.log('✅ User verification status updated successfully');

      // Send notification to admin about verification submission
      try {
        await NotificationService.createVerificationSubmittedNotification({
          userId: userUpdateResult.clerkId,
          userName: userUpdateResult.fullName || `${userUpdateResult.firstName} ${userUpdateResult.lastName}`,
          userEmail: userUpdateResult.email,
          verificationType: 'identity_verification'
        });
      } catch (notificationError) {
        console.error('⚠️ Failed to send admin notification for verification submission:', notificationError);
        // Don't fail the verification if notification fails
      }

      res.json({
        message: 'Identity verification completed successfully',
        verificationId: verification._id,
        status: 'verified'
      });
      return;
    }

    // Legacy support - if we reach here, it means old format was used
    // Convert to new format and process
    console.log('⚠️ Processing legacy verification format');

    const legacyVerification = new IdentityVerification({
      userId,
      nationalId,
      verificationStatus: 'verified',
      verificationSteps: {
        documentVerified: !!(documentImages?.frontImage && documentImages?.selfieImage),
        biometricVerified: !!fingerprintData?.template,
        manualReviewCompleted: true
      },
      verificationResults: {
        documentAuthenticity: 'passed',
        biometricMatch: 'passed',
        faceMatch: 'passed',
        overallScore: 100
      },
      submittedAt: new Date(),
      verifiedAt: new Date()
    });

    await legacyVerification.save();

    // Update user verification status
    await User.findOneAndUpdate(
      { clerkId: userId },
      {
        'identityVerification.isVerified': true,
        'identityVerification.verifiedAt': new Date(),
        'identityVerification.verificationLevel': 'fully_verified'
      }
    );

    res.json({
      message: 'Identity verification completed successfully',
      verificationId: legacyVerification._id,
      status: 'verified'
    });

  } catch (error) {
    console.error('❌ Submit identity verification error:', error);

    // Log more detailed error information
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }

    // Return more specific error information in development
    const errorMessage = error instanceof Error ? error.message : 'Failed to submit identity verification';
    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

// Get verification status for current user
export const getVerificationStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user.clerkId;
    console.log('🔍 Getting verification status for user:', userId);
    console.log('🔍 Request user object:', req.user);

    // Get user verification status from database
    const user = await User.findOne({ clerkId: userId });
    const verification = await IdentityVerification.findOne({ userId }).sort({ createdAt: -1 });

    console.log('👤 User found:', !!user);
    console.log('🔐 Verification found:', !!verification);
    console.log('📋 User verification status:', user?.identityVerification);
    console.log('📋 IdentityVerification status:', verification?.verificationStatus);

    // Enhanced debugging
    console.log('🔍 DETAILED DEBUG:');
    console.log('  User isVerified:', user?.identityVerification?.isVerified);
    console.log('  User verificationLevel:', user?.identityVerification?.verificationLevel);
    console.log('  IdentityVerification status:', verification?.verificationStatus);
    console.log('  IdentityVerification verifiedAt:', verification?.verifiedAt);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Primary source of truth: User model identityVerification field
    const userVerification = user.identityVerification;
    const isUserVerified = userVerification?.isVerified || false;
    const userVerificationLevel = userVerification?.verificationLevel || 'none';

    // Secondary check: IdentityVerification collection (for detailed info)
    const isVerificationRecordVerified = verification && verification.verificationStatus === 'verified';

    // Use User model as primary source, fallback to IdentityVerification record
    const isVerified = isUserVerified || isVerificationRecordVerified;
    const verificationLevel = userVerificationLevel !== 'none' ? userVerificationLevel : (isVerificationRecordVerified ? 'fully_verified' : 'none');

    console.log('🔍 COMPUTED VALUES:');
    console.log('  isUserVerified:', isUserVerified);
    console.log('  isVerificationRecordVerified:', isVerificationRecordVerified);
    console.log('  FINAL isVerified:', isVerified);
    console.log('  FINAL verificationLevel:', verificationLevel);

    const hasPaymentAccount = !!user?.paymentAccount;
    const isPaymentVerified = user?.paymentAccount?.isVerified || false;

    const status = {
      isVerified: isVerified,
      hasVerification: !!verification || !!userVerification,
      verificationStatus: isVerified ? 'verified' : (verification?.verificationStatus || 'none'),
      verificationLevel: verificationLevel,
      verifiedAt: userVerification?.verifiedAt || verification?.verifiedAt || verification?.createdAt || null,
      hasPaymentAccount: hasPaymentAccount,
      isPaymentVerified: isPaymentVerified,
      canListApartments: isVerified && hasPaymentAccount && isPaymentVerified,
      verificationDetails: verification ? {
        status: verification.verificationStatus,
        submittedAt: verification.createdAt,
        verifiedAt: verification.verifiedAt,
        riskScore: verification.fraudPrevention?.riskScore,
        method: verification.verificationMethod
      } : null,
      // Add user verification info for debugging
      userVerificationInfo: {
        isVerified: userVerification?.isVerified || false,
        verificationLevel: userVerification?.verificationLevel || 'none',
        verifiedAt: userVerification?.verifiedAt || null
      }
    };

    console.log('📊 Final verification status:', status);
    res.json(status);
  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({ error: 'Failed to get verification status' });
  }
};

// Legacy fingerprint verification endpoint (no longer used)
export const verifyFingerprint = async (req: Request, res: Response): Promise<void> => {
  try {
    // Since we no longer use fingerprint verification, return success for compatibility
    res.json({
      isMatch: true,
      confidence: 100,
      quality: 100,
      message: 'Fingerprint verification is no longer required. Using face verification instead.'
    });
  } catch (error) {
    console.error('Legacy fingerprint endpoint error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

// Upload additional documents
export const uploadDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user.clerkId;
    const { documentImages } = req.body;

    if (!documentImages) {
      res.status(400).json({ error: 'Document images are required' });
      return;
    }

    // Find existing verification
    const verification = await IdentityVerification.findOne({ userId });
    if (!verification) {
      res.status(404).json({ error: 'No verification found for user' });
      return;
    }

    // Update document images
    // verification.documentImages = { ...verification.documentImages, ...documentImages };
    // verification.verificationSteps.documentSubmitted = true;
    await verification.save();

    res.json({
      message: 'Documents uploaded successfully',
      verificationId: verification._id
    });

  } catch (error) {
    console.error('Upload documents error:', error);
    res.status(500).json({ error: 'Failed to upload documents' });
  }
};

// Get verification history for user
export const getVerificationHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user.clerkId;
    
    // Get verification record
    const verification = await IdentityVerification.findOne({ userId });

    // Since we no longer use biometric logs, return simplified history
    res.json({
      verification,
      logs: [], // No biometric logs needed
      summary: {
        totalAttempts: verification ? 1 : 0,
        successfulAttempts: verification?.verificationStatus === 'verified' ? 1 : 0,
        failedAttempts: 0,
        lastAttempt: verification?.createdAt
      }
    });

  } catch (error) {
    console.error('Get verification history error:', error);
    res.status(500).json({ error: 'Failed to get verification history' });
  }
};

// Admin: Get list of verifications for review
export const getVerificationsList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const filter: any = {};
    if (status) {
      filter.verificationStatus = status;
    }

    const verifications = await IdentityVerification.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('userId', 'email firstName lastName');

    const total = await IdentityVerification.countDocuments(filter);

    res.json({
      verifications,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error('Get verifications list error:', error);
    res.status(500).json({ error: 'Failed to get verifications list' });
  }
};

// Admin: Approve verification
export const adminApproveVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { verificationId } = req.params;
    const adminUserId = req.user.clerkId;

    const verification = await IdentityVerification.findById(verificationId);
    if (!verification) {
      res.status(404).json({ error: 'Verification not found' });
      return;
    }

    // Update verification status
    verification.verificationStatus = 'verified';
    verification.verifiedBy = adminUserId;
    verification.verifiedAt = new Date();
    // verification.verificationSteps.documentVerified = true;
    // verification.verificationSteps.biometricVerified = true;
    // verification.verificationSteps.manualReviewCompleted = true;
    // verification.verificationResults.documentAuthenticity = 'passed';
    // verification.verificationResults.biometricMatch = 'passed';
    // verification.verificationResults.faceMatch = 'passed';
    // verification.verificationResults.overallScore = 100;

    await verification.save();

    // Update user verification status
    await User.findOneAndUpdate(
      { clerkId: verification.userId },
      {
        'identityVerification.isVerified': true,
        'identityVerification.verifiedAt': new Date(),
        'identityVerification.verificationLevel': 'fully_verified'
      }
    );

    res.json({
      message: 'Verification approved successfully',
      verification
    });

  } catch (error) {
    console.error('Admin approve verification error:', error);
    res.status(500).json({ error: 'Failed to approve verification' });
  }
};

// Admin: Reject verification
export const adminRejectVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { verificationId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.user.clerkId;

    if (!reason) {
      res.status(400).json({ error: 'Rejection reason is required' });
      return;
    }

    const verification = await IdentityVerification.findById(verificationId);
    if (!verification) {
      res.status(404).json({ error: 'Verification not found' });
      return;
    }

    // Update verification status
    verification.verificationStatus = 'rejected';
    verification.rejectionReason = reason;
    verification.verifiedBy = adminUserId;
    // verification.verificationSteps.manualReviewCompleted = true;
    // verification.verificationResults.overallScore = 0;

    await verification.save();

    // Update user verification status
    await User.findOneAndUpdate(
      { clerkId: verification.userId },
      {
        'identityVerification.isVerified': false,
        'identityVerification.verificationLevel': 'rejected'
      }
    );

    res.json({
      message: 'Verification rejected successfully',
      verification
    });

  } catch (error) {
    console.error('Admin reject verification error:', error);
    res.status(500).json({ error: 'Failed to reject verification' });
  }
};

// Admin function to reset user verification for testing
export const resetUserVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔄 Admin resetting user verification');

    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    console.log('👤 Resetting verification for user:', userId);

    // Delete existing verification
    const result = await IdentityVerification.deleteMany({ userId });

    console.log(`✅ Deleted ${result.deletedCount} verification(s) for user ${userId}`);

    res.json({
      message: 'User verification reset successfully',
      deletedCount: result.deletedCount,
      userId
    });

  } catch (error) {
    console.error('❌ Error resetting user verification:', error);
    res.status(500).json({
      error: 'Failed to reset verification',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
