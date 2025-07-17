import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Apartment from '../models/Apartment';
import User from '../models/User';
import Commission from '../models/Commission';

// Get admin dashboard stats
export const getAdminStats = async (req: Request, res: Response) => {
  try {
    console.log('📊 Getting admin stats...');

    // Get total commissions (only from bookings with successful payments)
    const commissionStats = await Commission.aggregate([
      {
        // Only include commissions that have a payment reference (successful payments)
        $match: {
          paymentReference: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          totalCommission: { $sum: '$commissionAmount' },
          paidCommission: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$commissionAmount', 0]
            }
          },
          pendingCommission: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, '$commissionAmount', 0]
            }
          }
        }
      }
    ]);

    // Get apartment stats
    const apartmentStats = await Apartment.aggregate([
      {
        $group: {
          _id: null,
          totalApartments: { $sum: 1 },
          activeApartments: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          },
          averageRating: { $avg: '$rating' }
        }
      }
    ]);

    // Get actual house owner stats (users who own apartments)
    const apartmentOwnerIds = await Apartment.distinct('ownerId');
    const ownerStats = await User.aggregate([
      { $match: { clerkId: { $in: apartmentOwnerIds } } }, // Only users who own apartments
      {
        $group: {
          _id: null,
          activeOwners: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          },
          totalOwners: { $sum: 1 }
        }
      }
    ]);

    // Get booking stats
    const bookingStats = await Booking.aggregate([
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          pendingReports: {
            $sum: {
              $cond: [{ $eq: ['$bookingStatus', 'pending'] }, 1, 0]
            }
          }
        }
      }
    ]);

    const stats = {
      totalCommission: commissionStats[0]?.totalCommission || 0,
      paidCommission: commissionStats[0]?.paidCommission || 0,
      pendingCommission: commissionStats[0]?.pendingCommission || 0,
      totalApartments: apartmentStats[0]?.totalApartments || 0,
      activeApartments: apartmentStats[0]?.activeApartments || 0,
      averageRating: apartmentStats[0]?.averageRating || 0,
      activeOwners: ownerStats[0]?.activeOwners || 0,
      totalOwners: ownerStats[0]?.totalOwners || 0,
      totalBookings: bookingStats[0]?.totalBookings || 0,
      pendingReports: bookingStats[0]?.pendingReports || 0
    };

    console.log('📊 Admin stats retrieved:', stats);
    res.json(stats);
  } catch (error) {
    console.error('❌ Error getting admin stats:', error);
    res.status(500).json({ error: 'Failed to get admin stats' });
  }
};

// Get commissions with pagination and filtering
export const getCommissions = async (req: Request, res: Response) => {
  try {
    console.log('📊 Admin requesting commissions...');
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const skip = (page - 1) * limit;

    // First, let's check all commissions without payment reference filter
    const allCommissions = await Commission.find({}).limit(5);
    console.log(`🔍 Total commissions in database: ${allCommissions.length}`);
    if (allCommissions.length > 0) {
      console.log('📋 Sample commission:', {
        id: allCommissions[0]._id,
        paymentReference: allCommissions[0].paymentReference,
        status: allCommissions[0].status,
        commissionAmount: allCommissions[0].commissionAmount
      });
    }

    const filter: any = {
      // Show all commissions (including those without payment references for manual review)
    };

    console.log('🔍 Commission filter (showing all commissions):', filter);

    if (status) filter.status = status;
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const commissions = await Commission.find(filter)
      .populate('bookingId', 'checkIn checkOut')
      .populate('apartmentId', 'title')
      .populate('ownerId', 'firstName lastName')
      .populate('guestId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Commission.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    console.log(`📊 Found ${commissions.length} commissions with payment references (total: ${total})`);
    if (commissions.length === 0) {
      console.log('⚠️ No commissions found with payment references. This might be why admin dashboard is empty.');
    }

    // Format commissions for frontend
    const formattedCommissions = commissions.map(commission => {
      const apartmentData = commission.apartmentId as any;
      const ownerData = commission.ownerId as any;
      const guestData = commission.guestId as any;

      return {
        _id: (commission._id as any).toString(),
        bookingId: commission.bookingId?._id?.toString() || commission.bookingId?.toString() || '',
        apartmentId: apartmentData?._id?.toString() || apartmentData?.toString() || '',
        apartmentTitle: apartmentData?.title || 'Unknown Apartment',
        ownerId: ownerData?._id?.toString() || ownerData?.toString() || '',
        ownerName: ownerData?.firstName && ownerData?.lastName
          ? `${ownerData.firstName} ${ownerData.lastName}`
          : 'Unknown Owner',
        guestId: guestData?._id?.toString() || guestData?.toString() || '',
        guestName: guestData?.firstName && guestData?.lastName
          ? `${guestData.firstName} ${guestData.lastName}`
          : 'Unknown Guest',
        roomPrice: commission.roomPrice,
        commissionRate: commission.commissionRate,
        commissionAmount: commission.commissionAmount,
        bookingDate: commission.bookingDate,
        checkInDate: commission.checkInDate,
        checkOutDate: commission.checkOutDate,
        status: commission.status,
        createdAt: commission.createdAt,
        paymentReference: commission.paymentReference
      };
    });

    res.json({
      commissions: formattedCommissions,
      total,
      totalPages,
      currentPage: page
    });
  } catch (error) {
    console.error('❌ Error getting commissions:', error);
    res.status(500).json({ error: 'Failed to get commissions' });
  }
};

// Update commission status
export const updateCommissionStatus = async (req: Request, res: Response) => {
  try {
    const { commissionId } = req.params;
    const { status } = req.body;

    const commission = await Commission.findByIdAndUpdate(
      commissionId,
      { status, updatedAt: new Date() },
      { new: true }
    ).populate('bookingId apartmentId ownerId guestId');

    if (!commission) {
      return res.status(404).json({ error: 'Commission not found' });
    }

    // Format commission for frontend
    const apartmentData = commission.apartmentId as any;
    const ownerData = commission.ownerId as any;
    const guestData = commission.guestId as any;

    const formattedCommission = {
      _id: (commission._id as any).toString(),
      bookingId: commission.bookingId?._id?.toString() || commission.bookingId?.toString() || '',
      apartmentId: apartmentData?._id?.toString() || apartmentData?.toString() || '',
      apartmentTitle: apartmentData?.title || 'Unknown Apartment',
      ownerId: ownerData?._id?.toString() || ownerData?.toString() || '',
      ownerName: ownerData?.firstName && ownerData?.lastName
        ? `${ownerData.firstName} ${ownerData.lastName}`
        : 'Unknown Owner',
      guestId: guestData?._id?.toString() || guestData?.toString() || '',
      guestName: guestData?.firstName && guestData?.lastName
        ? `${guestData.firstName} ${guestData.lastName}`
        : 'Unknown Guest',
      roomPrice: commission.roomPrice,
      commissionRate: commission.commissionRate,
      commissionAmount: commission.commissionAmount,
      bookingDate: commission.bookingDate,
      checkInDate: commission.checkInDate,
      checkOutDate: commission.checkOutDate,
      status: commission.status,
      createdAt: commission.createdAt,
      paymentReference: commission.paymentReference
    };

    console.log(`💰 Commission ${commissionId} status updated to ${status}`);
    return res.json(formattedCommission);
  } catch (error) {
    console.error('❌ Error updating commission status:', error);
    return res.status(500).json({ error: 'Failed to update commission status' });
  }
};

// Get all apartments for admin
export const getAllApartments = async (req: Request, res: Response) => {
  try {
    console.log('🏠 Getting all apartments for admin...');
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;

    console.log('🏠 Query params:', { page, limit, status, search });

    const skip = (page - 1) * limit;
    const filter: any = {};

    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'location.town': { $regex: search, $options: 'i' } },
        { 'location.region': { $regex: search, $options: 'i' } }
      ];
    }

    console.log('🏠 Filter:', filter);

    const apartments = await Apartment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    console.log(`🏠 Found ${apartments.length} apartments`);

    // Get booking counts for each apartment
    console.log('🏠 Starting booking count calculation...');
    const apartmentsWithStats = await Promise.all(
      apartments.map(async (apartment) => {
        console.log(`🏠 Processing apartment: ${apartment.title} (ID: ${apartment._id})`);

        const bookingCount = await Booking.countDocuments({
          apartmentId: apartment._id,
          bookingStatus: { $in: ['confirmed', 'checked-in', 'completed'] }
        });

        console.log(`🏠 Apartment "${apartment.title}" has ${bookingCount} bookings`);

        return {
          ...apartment.toObject(),
          totalBookings: bookingCount,
          // Use the ownerName field that's already stored in the apartment
          ownerName: apartment.ownerName || 'Unknown Owner'
        };
      })
    );
    console.log('🏠 Finished booking count calculation');

    const total = await Apartment.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    console.log('🏠 Apartments response:', {
      apartmentsCount: apartmentsWithStats.length,
      total,
      totalPages,
      currentPage: page
    });

    res.json({
      apartments: apartmentsWithStats,
      total,
      totalPages,
      currentPage: page
    });
  } catch (error) {
    console.error('❌ Error getting apartments:', error);
    res.status(500).json({ error: 'Failed to get apartments' });
  }
};

// Update apartment status
export const updateApartmentStatus = async (req: Request, res: Response) => {
  try {
    const { apartmentId } = req.params;
    const { status } = req.body;

    const apartment = await Apartment.findByIdAndUpdate(
      apartmentId,
      { status, updatedAt: new Date() },
      { new: true }
    ).populate('ownerId', 'firstName lastName email');

    if (!apartment) {
      return res.status(404).json({ error: 'Apartment not found' });
    }

    console.log(`🏠 Apartment ${apartmentId} status updated to ${status}`);
    return res.json(apartment);
  } catch (error) {
    console.error('❌ Error updating apartment status:', error);
    return res.status(500).json({ error: 'Failed to update apartment status' });
  }
};

// Get all owners for admin
export const getAllOwners = async (req: Request, res: Response) => {
  try {
    console.log('👥 Getting all house owners for admin...');
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;

    console.log('👥 Query params:', { page, limit, status, search });

    const skip = (page - 1) * limit;

    // First, get all unique owner IDs from apartments
    const apartmentOwners = await Apartment.distinct('ownerId');
    console.log(`👥 Found ${apartmentOwners.length} unique apartment owners`);

    // Build filter for users who own apartments
    const filter: any = {
      clerkId: { $in: apartmentOwners } // Only users who have apartments
    };

    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('👥 Filter:', filter);

    const owners = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    console.log(`👥 Found ${owners.length} actual house owners`);

    // Get stats for each owner
    const ownersWithStats = await Promise.all(
      owners.map(async (owner) => {
        // Use clerkId to match apartments (since apartments store ownerId as clerkId)
        const apartmentCount = await Apartment.countDocuments({ ownerId: owner.clerkId });

        // Get apartment IDs for this owner
        const ownerApartments = await Apartment.find({ ownerId: owner.clerkId }).distinct('_id');
        const bookingCount = await Booking.countDocuments({
          apartmentId: { $in: ownerApartments }
        });

        const commissionStats = await Commission.aggregate([
          { $match: { ownerId: owner.clerkId } }, // Use clerkId here too
          {
            $group: {
              _id: null,
              totalEarnings: { $sum: '$roomPrice' },
              commissionPaid: { $sum: '$commissionAmount' }
            }
          }
        ]);

        // Check verification status
        const identityVerified = owner.identityVerification?.isVerified || false;
        const paymentVerified = owner.paymentAccount?.isVerified || false;
        const fullyVerified = identityVerified && paymentVerified;

        return {
          ...owner.toObject(),
          apartmentCount: apartmentCount,
          totalBookings: bookingCount,
          totalEarnings: commissionStats[0]?.totalEarnings || 0,
          commissionPaid: commissionStats[0]?.commissionPaid || 0,
          isVerified: fullyVerified,
          identityVerified: identityVerified,
          paymentVerified: paymentVerified,
          verificationLevel: owner.identityVerification?.verificationLevel || 'none'
        };
      })
    );

    const total = await User.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    console.log('👥 Owners response:', {
      ownersCount: ownersWithStats.length,
      total,
      totalPages,
      currentPage: page
    });

    res.json({
      owners: ownersWithStats,
      total,
      totalPages,
      currentPage: page
    });
  } catch (error) {
    console.error('❌ Error getting owners:', error);
    res.status(500).json({ error: 'Failed to get owners' });
  }
};

// Update owner status
export const updateOwnerStatus = async (req: Request, res: Response) => {
  try {
    const { ownerId } = req.params;
    const { status } = req.body;

    const owner = await User.findByIdAndUpdate(
      ownerId,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!owner) {
      return res.status(404).json({ error: 'Owner not found' });
    }

    // When suspending an owner, also suspend all their apartments
    if (status === 'suspended') {
      const apartmentUpdateResult = await Apartment.updateMany(
        { ownerId: owner.clerkId },
        { status: 'suspended', updatedAt: new Date() }
      );
      console.log(`🏠 Suspended ${apartmentUpdateResult.modifiedCount} apartments for owner ${owner.clerkId}`);
    }

    // When reactivating an owner, reactivate their apartments (but only if they were suspended)
    if (status === 'active') {
      const apartmentUpdateResult = await Apartment.updateMany(
        { ownerId: owner.clerkId, status: 'suspended' },
        { status: 'active', updatedAt: new Date() }
      );
      console.log(`🏠 Reactivated ${apartmentUpdateResult.modifiedCount} apartments for owner ${owner.clerkId}`);
    }

    console.log(`👤 Owner ${ownerId} status updated to ${status}`);
    return res.json(owner);
  } catch (error) {
    console.error('❌ Error updating owner status:', error);
    return res.status(500).json({ error: 'Failed to update owner status' });
  }
};

// Update apartment payment accounts (admin only)
export const updateApartmentPaymentAccounts = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔄 Starting apartment payment account update...');

    // Find all apartments that don't have ownerPaymentAccount or have incomplete data
    const apartments = await Apartment.find({
      $or: [
        { ownerPaymentAccount: { $exists: false } },
        { 'ownerPaymentAccount.provider': { $exists: false } },
        { 'ownerPaymentAccount.subaccountCode': { $exists: false } }
      ]
    });

    console.log(`📊 Found ${apartments.length} apartments to update`);

    let updatedCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const apartment of apartments) {
      console.log(`\n🏠 Processing apartment: ${apartment.title} (Owner: ${apartment.ownerId})`);

      // Find the owner's user record
      const owner = await User.findOne({ clerkId: apartment.ownerId });

      if (!owner) {
        console.log(`❌ Owner not found for apartment ${apartment.title}`);
        skippedCount++;
        results.push({
          apartmentId: apartment._id,
          title: apartment.title,
          status: 'skipped',
          reason: 'Owner not found'
        });
        continue;
      }

      if (!owner.paymentAccount?.isVerified) {
        console.log(`⚠️ Owner ${owner.email} doesn't have verified payment account`);
        skippedCount++;
        results.push({
          apartmentId: apartment._id,
          title: apartment.title,
          status: 'skipped',
          reason: 'Owner has no verified payment account'
        });
        continue;
      }

      // Update apartment with owner's payment account data
      const ownerPaymentAccount = {
        provider: owner.paymentAccount.provider,
        subaccountCode: owner.paymentAccount.accountDetails?.subaccountCode,
        accountNumber: owner.paymentAccount.accountDetails?.accountNumber,
        bankCode: owner.paymentAccount.accountDetails?.bankCode,
        momoNumber: owner.paymentAccount.accountDetails?.momoNumber,
        momoProvider: owner.paymentAccount.accountDetails?.momoProvider
      };

      await Apartment.findByIdAndUpdate(
        apartment._id,
        { ownerPaymentAccount },
        { new: true }
      );

      console.log(`✅ Updated apartment ${apartment.title} with payment account data`);
      updatedCount++;
      results.push({
        apartmentId: apartment._id,
        title: apartment.title,
        status: 'updated',
        paymentProvider: ownerPaymentAccount.provider,
        subaccountCode: ownerPaymentAccount.subaccountCode
      });
    }

    res.json({
      message: 'Apartment payment account update completed',
      summary: {
        total: apartments.length,
        updated: updatedCount,
        skipped: skippedCount
      },
      results
    });

  } catch (error) {
    console.error('❌ Error updating apartment payment accounts:', error);
    res.status(500).json({
      error: 'Failed to update apartment payment accounts',
      details: (error as Error).message
    });
  }
};

// Migration function to create commissions for existing bookings
export const migrateCommissions = async (req: Request, res: Response) => {
  try {
    console.log('🔄 Starting commission migration for existing bookings...');

    // Find all bookings that don't have corresponding commissions
    const bookings = await Booking.find({
      $or: [
        { paymentStatus: 'paid' },
        { paymentStatus: 'completed' }
      ]
    }).populate({
      path: 'apartmentId',
      select: 'title ownerId'
    });

    console.log(`📋 Found ${bookings.length} paid/completed bookings to check`);

    let createdCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const booking of bookings) {
      try {
        const apartmentData = booking.apartmentId as any;

        console.log(`🔍 Processing booking ${booking._id}:`, {
          apartmentId: apartmentData?._id,
          ownerClerkId: apartmentData?.ownerId,
          totalAmount: booking.totalAmount,
          paymentStatus: booking.paymentStatus
        });

        // Check if commission already exists for this booking
        const existingCommission = await Commission.findOne({ bookingId: booking._id });

        if (existingCommission) {
          console.log(`⏭️ Skipping booking ${booking._id} - commission already exists`);
          skippedCount++;
          results.push({
            bookingId: booking._id,
            status: 'skipped',
            reason: 'Commission already exists'
          });
          continue;
        }

        // Validate required data
        if (!apartmentData) {
          throw new Error('Apartment not found');
        }

        if (!apartmentData.ownerId) {
          throw new Error('Apartment owner not found');
        }

        if (!booking.totalAmount || booking.totalAmount <= 0) {
          throw new Error('Invalid booking amount');
        }

        // Find the owner User document by clerkId
        const ownerUser = await User.findOne({ clerkId: apartmentData.ownerId });
        if (!ownerUser) {
          throw new Error(`Owner user not found for clerkId: ${apartmentData.ownerId}`);
        }

        // Find the guest User document by clerkId
        const guestUser = await User.findOne({ clerkId: booking.guestId });
        if (!guestUser) {
          throw new Error(`Guest user not found for clerkId: ${booking.guestId}`);
        }

        // Create commission for this booking
        const commissionRate = 0.05; // 5%
        const commissionAmount = booking.totalAmount * commissionRate;

        const commission = new Commission({
          bookingId: booking._id,
          apartmentId: booking.apartmentId._id,
          ownerId: ownerUser._id, // Use the User's MongoDB ObjectId
          guestId: guestUser._id, // Use the User's MongoDB ObjectId
          roomPrice: booking.totalAmount,
          commissionRate,
          commissionAmount,
          bookingDate: booking.createdAt,
          checkInDate: booking.checkIn,
          checkOutDate: booking.checkOut,
          paymentReference: booking.paymentReference || `migration_${booking._id}`,
          status: 'paid' // Mark as paid since booking is already paid
        });

        await commission.save();
        createdCount++;

        results.push({
          bookingId: booking._id,
          apartmentTitle: apartmentData?.title || 'Unknown',
          guestId: booking.guestId,
          ownerName: `${ownerUser.firstName} ${ownerUser.lastName}`,
          commissionAmount: commissionAmount.toFixed(2),
          status: commission.status
        });

        console.log(`✅ Created commission for booking ${booking._id}: GHS ${commissionAmount.toFixed(2)}`);

      } catch (error) {
        console.error(`❌ Failed to create commission for booking ${booking._id}:`, error);
        results.push({
          bookingId: booking._id,
          error: (error as Error).message
        });
      }
    }

    console.log(`🎉 Commission migration completed: ${createdCount} created, ${skippedCount} skipped`);

    res.json({
      message: 'Commission migration completed',
      summary: {
        totalBookings: bookings.length,
        commissionsCreated: createdCount,
        commissionsSkipped: skippedCount
      },
      results
    });

  } catch (error) {
    console.error('❌ Error during commission migration:', error);
    res.status(500).json({
      error: 'Failed to migrate commissions',
      details: (error as Error).message
    });
  }
};

// New function to recalculate all commission stats
export const recalculateCommissions = async (req: Request, res: Response) => {
  try {
    console.log('🔄 Recalculating commission statistics...');

    // Get all commission records
    const commissions = await Commission.find({});
    console.log(`📊 Found ${commissions.length} commission records`);

    // Calculate totals
    const totalCommission = commissions.reduce((sum, c) => sum + c.commissionAmount, 0);
    const paidCommission = commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.commissionAmount, 0);
    const pendingCommission = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.commissionAmount, 0);

    console.log('📊 Commission Statistics:');
    console.log(`   Total Commission: GHS ${totalCommission.toFixed(2)}`);
    console.log(`   Paid Commission: GHS ${paidCommission.toFixed(2)}`);
    console.log(`   Pending Commission: GHS ${pendingCommission.toFixed(2)}`);

    res.json({
      message: 'Commission statistics recalculated',
      statistics: {
        totalCommission,
        paidCommission,
        pendingCommission,
        totalRecords: commissions.length
      }
    });

  } catch (error) {
    console.error('❌ Error recalculating commissions:', error);
    res.status(500).json({ error: 'Failed to recalculate commissions' });
  }
};
