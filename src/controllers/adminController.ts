import { Request, Response } from 'express';
import Booking from '../models/Booking';
import Apartment from '../models/Apartment';
import User from '../models/User';
import Commission from '../models/Commission';

// Get admin dashboard stats
export const getAdminStats = async (req: Request, res: Response) => {
  try {
    console.log('📊 Getting admin stats...');

    // Get total commissions
    const commissionStats = await Commission.aggregate([
      {
        $group: {
          _id: null,
          totalCommission: { $sum: '$commissionAmount' },
          paidCommission: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$commissionAmount', 0]
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
              $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
            }
          }
        }
      }
    ]);

    const stats = {
      totalCommission: commissionStats[0]?.totalCommission || 0,
      paidCommission: commissionStats[0]?.paidCommission || 0,
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const skip = (page - 1) * limit;
    const filter: any = {};

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

    res.json({
      commissions,
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

    console.log(`💰 Commission ${commissionId} status updated to ${status}`);
    return res.json(commission);
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
    const apartmentsWithStats = await Promise.all(
      apartments.map(async (apartment) => {
        const bookingCount = await Booking.countDocuments({
          apartmentId: apartment._id,
          status: { $in: ['confirmed', 'checked-in', 'checked-out'] }
        });

        return {
          ...apartment.toObject(),
          totalBookings: bookingCount,
          // Use the ownerName field that's already stored in the apartment
          ownerName: apartment.ownerName || 'Unknown Owner'
        };
      })
    );

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

    console.log(`👤 Owner ${ownerId} status updated to ${status}`);
    return res.json(owner);
  } catch (error) {
    console.error('❌ Error updating owner status:', error);
    return res.status(500).json({ error: 'Failed to update owner status' });
  }
};
