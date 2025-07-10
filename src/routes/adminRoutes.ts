import express, { Request, Response } from 'express';
import { requireAuth } from '@clerk/express';
import User from '../models/User';
import {
  getAdminStats,
  getCommissions,
  updateCommissionStatus,
  getAllApartments,
  updateApartmentStatus,
  getAllOwners,
  updateOwnerStatus
} from '../controllers/adminController';

const router = express.Router();

// Middleware to check admin role
const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    if (!req.auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user from database
    const user = await User.findOne({ clerkId: req.auth.userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has admin role
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Admin middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



// Debug endpoint to check apartments and owners
router.get('/debug-owners', async (req, res) => {
  try {
    const Apartment = (await import('../models/Apartment')).default;

    // Get all apartments with owner info
    const apartments = await Apartment.find({}).select('ownerId ownerName ownerEmail title');

    // Get unique owner IDs
    const uniqueOwnerIds = await Apartment.distinct('ownerId');

    // Get users who own apartments with full verification data
    const actualOwners = await User.find({ clerkId: { $in: uniqueOwnerIds } });

    // Get all users with 'owner' role
    const roleOwners = await User.find({ role: 'owner' });

    res.json({
      message: 'Debug info for owners and verification',
      apartments: apartments.length,
      apartmentSample: apartments.slice(0, 3),
      uniqueOwnerIds: uniqueOwnerIds.length,
      uniqueOwnerIdsSample: uniqueOwnerIds.slice(0, 5),
      actualOwners: actualOwners.length,
      actualOwnersSample: actualOwners.slice(0, 3).map(u => ({
        clerkId: u.clerkId,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        role: u.role,
        identityVerification: u.identityVerification,
        paymentAccount: u.paymentAccount,
        hasIdentityVerification: !!u.identityVerification,
        hasPaymentAccount: !!u.paymentAccount,
        identityVerified: u.identityVerification?.isVerified || false,
        paymentVerified: u.paymentAccount?.isVerified || false
      })),
      roleOwners: roleOwners.length,
      roleOwnersSample: roleOwners.slice(0, 3).map(u => ({
        clerkId: u.clerkId,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        role: u.role,
        hasIdentityVerification: !!u.identityVerification,
        hasPaymentAccount: !!u.paymentAccount
      }))
    });
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: 'Debug failed' });
  }
});

// Setup admin user by email
router.get('/setup-admin', async (req: any, res: any) => {
  try {
    const adminEmail = 'bamenorhu8@gmail.com';
    console.log(`🔧 Setting up admin for email: ${adminEmail}`);

    const user = await User.findOneAndUpdate(
      { email: adminEmail },
      { role: 'admin' },
      { new: true, upsert: false }
    );

    if (!user) {
      return res.status(404).json({
        error: 'Admin user not found. Please sign in with bamenorhu8@gmail.com first.'
      });
    }

    console.log(`✅ User ${adminEmail} is now an admin`);
    return res.json({
      message: 'Admin setup complete!',
      user: {
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    console.error('❌ Error setting up admin:', error);
    return res.status(500).json({ error: 'Failed to setup admin' });
  }
});

// Migrate apartments to add status field
router.get('/migrate-apartments', async (req, res) => {
  try {
    console.log('🔄 Migrating apartments to add status field...');

    const Apartment = (await import('../models/Apartment')).default;

    // Update all apartments without status field
    const result = await Apartment.updateMany(
      { status: { $exists: false } },
      {
        $set: {
          status: 'active' // Set default status
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} apartments with status field`);

    res.json({
      message: 'Apartment migration complete!',
      updated: result.modifiedCount
    });
  } catch (error) {
    console.error('❌ Error migrating apartments:', error);
    res.status(500).json({ error: 'Failed to migrate apartments' });
  }
});

// Migrate users to add status field
router.get('/migrate-users', async (req, res) => {
  try {
    console.log('🔄 Migrating users to add status field...');

    // Update all users without status field
    const result = await User.updateMany(
      { status: { $exists: false } },
      {
        $set: {
          status: 'active' // Set default status
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} users with status field`);

    res.json({
      message: 'User migration complete!',
      updated: result.modifiedCount
    });
  } catch (error) {
    console.error('❌ Error migrating users:', error);
    res.status(500).json({ error: 'Failed to migrate users' });
  }
});

// Setup verification data for house owners
router.get('/setup-verification', async (req, res) => {
  try {
    console.log('🔄 Setting up verification data for house owners...');

    const Apartment = (await import('../models/Apartment')).default;

    // Get all unique owner IDs from apartments
    const apartmentOwnerIds = await Apartment.distinct('ownerId');
    console.log(`Found ${apartmentOwnerIds.length} apartment owners:`, apartmentOwnerIds);

    // Get actual users who own apartments
    const houseOwners = await User.find({ clerkId: { $in: apartmentOwnerIds } });
    console.log(`Found ${houseOwners.length} house owner users`);

    let updated = 0;

    // Update each house owner individually to ensure proper structure
    for (const owner of houseOwners) {
      try {
        const updateResult = await User.updateOne(
          { _id: owner._id },
          {
            $set: {
              'identityVerification.isVerified': true,
              'identityVerification.verificationLevel': 'fully_verified',
              'identityVerification.verifiedAt': new Date(),
              'paymentAccount.isVerified': true,
              'paymentAccount.createdAt': new Date()
            }
          }
        );

        if (updateResult.modifiedCount > 0) {
          updated++;
          console.log(`✅ Updated verification for ${owner.firstName} ${owner.lastName} (${owner.email})`);
        }
      } catch (error) {
        console.error(`❌ Failed to update ${owner.email}:`, error);
      }
    }

    console.log(`✅ Updated ${updated} house owners with verification data`);

    res.json({
      message: 'Verification setup complete!',
      updated: updated,
      totalOwners: apartmentOwnerIds.length,
      foundUsers: houseOwners.length,
      details: houseOwners.map(u => ({
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        clerkId: u.clerkId
      }))
    });
  } catch (error) {
    console.error('❌ Error setting up verification:', error);
    res.status(500).json({ error: 'Failed to setup verification' });
  }
});

// Simple test verification setup
router.get('/test-verification/:email', async (req: any, res: any) => {
  try {
    const { email } = req.params;
    console.log(`🧪 Setting up test verification for: ${email}`);

    const user = await User.findOneAndUpdate(
      { email: email },
      {
        $set: {
          'identityVerification.isVerified': true,
          'identityVerification.verificationLevel': 'fully_verified',
          'identityVerification.verifiedAt': new Date(),
          'paymentAccount.isVerified': true,
          'paymentAccount.provider': 'paystack',
          'paymentAccount.createdAt': new Date()
        }
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Test verification set for ${user.firstName} ${user.lastName}`);

    return res.json({
      message: 'Test verification setup complete!',
      user: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        identityVerified: user.identityVerification?.isVerified,
        paymentVerified: user.paymentAccount?.isVerified,
        verificationLevel: user.identityVerification?.verificationLevel
      }
    });
  } catch (error) {
    console.error('❌ Error setting up test verification:', error);
    return res.status(500).json({ error: 'Failed to setup test verification' });
  }
});

// Temporary endpoint to make a user admin (no auth required - REMOVE IN PRODUCTION)
router.post('/make-admin/:clerkId', async (req: any, res: any) => {
  try {
    const { clerkId } = req.params;
    console.log(`🔧 Making user ${clerkId} an admin...`);

    const user = await User.findOneAndUpdate(
      { clerkId },
      { role: 'admin' },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ User ${clerkId} is now an admin`);
    return res.json({
      message: 'User is now admin',
      user: {
        clerkId: user.clerkId,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    console.error('❌ Error making user admin:', error);
    return res.status(500).json({ error: 'Failed to make user admin' });
  }
});

// Simple middleware for admin routes (check if admin user exists)
const simpleAdminCheck = async (req: any, res: any, next: any) => {
  try {
    // Check if the admin user (bamenorhu8@gmail.com) exists and has admin role
    const adminUser = await User.findOne({
      email: 'bamenorhu8@gmail.com',
      role: 'admin'
    });

    if (!adminUser) {
      return res.status(403).json({
        error: 'Admin access required. Admin user not found.',
        hint: 'Please sign in with bamenorhu8@gmail.com and visit /api/admin/setup-admin'
      });
    }

    req.user = adminUser;
    next();
  } catch (error) {
    console.error('❌ Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Apply simple admin check to protected routes
router.use('/stats', simpleAdminCheck);
router.use('/commissions', simpleAdminCheck);
router.use('/apartments', simpleAdminCheck);
router.use('/owners', simpleAdminCheck);

// Dashboard stats
router.get('/stats', getAdminStats);

// Commission management
router.get('/commissions', getCommissions as any);
router.patch('/commissions/:commissionId/status', updateCommissionStatus as any);

// Apartment management
router.get('/apartments', getAllApartments as any);
router.patch('/apartments/:apartmentId/status', updateApartmentStatus as any);

// Owner management
router.get('/owners', getAllOwners as any);
router.patch('/owners/:ownerId/status', updateOwnerStatus as any);



export default router;
