import { Request, Response } from 'express';
import Apartment, { IApartment } from '../models/Apartment';
import User from '../models/User';
import { syncUserWithClerk } from '../utils/userUtils';
import NotificationService from '../services/notificationService';

// Get all apartments with optional filtering
export const getApartments = async (req: Request, res: Response) => {
  try {
    const {
      country,
      region,
      town,
      minPrice,
      maxPrice,
      minRooms,
      amenities,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Get active (non-suspended) owners
    const activeOwners = await User.find({ status: 'active' }).distinct('clerkId');
    console.log(`🔍 Found ${activeOwners.length} active owners`);

    // Build filter object - only show apartments from active owners
    const filter: Record<string, unknown> = {
      isActive: true,
      ownerId: { $in: activeOwners }
    };

    if (country) filter['location.country'] = new RegExp(country as string, 'i');
    if (region) filter['location.region'] = new RegExp(region as string, 'i');
    if (town) filter['location.town'] = new RegExp(town as string, 'i');
    if (minPrice || maxPrice) {
      const priceFilter: Record<string, number> = {};
      if (minPrice) priceFilter.$gte = Number(minPrice);
      if (maxPrice) priceFilter.$lte = Number(maxPrice);
      filter.price = priceFilter;
    }
    if (minRooms) filter.availableRooms = { $gte: Number(minRooms) };
    if (amenities) {
      const amenityList = (amenities as string).split(',');
      filter.amenities = { $in: amenityList };
    }

    // Calculate pagination
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [apartments, total] = await Promise.all([
      Apartment.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Apartment.countDocuments(filter)
    ]);

    // Debug: Log apartment payment account data
    console.log('🏠 Apartments fetched:', apartments.length);
    apartments.forEach(apt => {
      console.log(`🏠 ${apt.title}: Payment Account = ${apt.ownerPaymentAccount ? 'Present' : 'Missing'}`);
      if (apt.ownerPaymentAccount) {
        console.log(`   Provider: ${apt.ownerPaymentAccount.provider}, Subaccount: ${apt.ownerPaymentAccount.subaccountCode || 'N/A'}`);
      }
    });

    res.json({
      apartments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching apartments:', error);
    res.status(500).json({ error: 'Failed to fetch apartments' });
  }
};

// Get single apartment by ID
export const getApartmentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const apartment = await Apartment.findById(id);

    if (!apartment) {
      res.status(404).json({ error: 'Apartment not found' });
      return;
    }

    if (!apartment.isActive) {
      res.status(404).json({ error: 'Apartment is not available' });
      return;
    }

    res.json(apartment);
  } catch (error) {
    console.error('Error fetching apartment:', error);
    res.status(500).json({ error: 'Failed to fetch apartment' });
  }
};

// Create new apartment (owner only)
export const createApartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      location,
      price,
      totalRooms,
      images,
      amenities
    } = req.body;

    // Sync user with Clerk to get latest data
    const reqUser = (req as any).user;
    if (!reqUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const user = await syncUserWithClerk(reqUser.clerkId);

    // Check identity verification requirement
    if (!user.identityVerification?.isVerified) {
      res.status(403).json({
        error: 'Identity verification required',
        message: 'You must complete identity verification before listing apartments',
        verificationLevel: user.identityVerification?.verificationLevel || 'none'
      });
      return;
    }

    // Check payment account requirement
    if (!user.paymentAccount?.isVerified) {
      res.status(403).json({
        error: 'Payment account required',
        message: 'You must set up and verify a payment account before listing apartments',
        hasPaymentAccount: !!user.paymentAccount
      });
      return;
    }

    console.log('🔍 User object for apartment creation:', {
      clerkId: user.clerkId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName
    });

    // Calculate ownerName properly for owner-renter mapping
    let calculatedOwnerName = '';

    // Try to get name from Clerk user data
    if (user.fullName && user.fullName.trim() && user.fullName.trim() !== '') {
      calculatedOwnerName = user.fullName.trim();
    } else if (user.firstName || user.lastName) {
      const firstName = user.firstName?.trim() || '';
      const lastName = user.lastName?.trim() || '';
      const combined = `${firstName} ${lastName}`.trim();
      if (combined) {
        calculatedOwnerName = combined;
      }
    }

    // If still no name, use email prefix or fallback
    if (!calculatedOwnerName) {
      if (user.email) {
        // Extract name from email (e.g., john.doe@example.com -> John Doe)
        const emailPrefix = user.email.split('@')[0];
        const nameParts = emailPrefix.split(/[._-]/).map(part =>
          part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        );
        calculatedOwnerName = nameParts.join(' ');
      } else {
        calculatedOwnerName = 'Property Owner';
      }
    }

    // Map payment account details for direct payments
    const ownerPaymentAccount = {
      provider: user.paymentAccount.provider,
      subaccountCode: user.paymentAccount.accountDetails.subaccountCode,
      accountNumber: user.paymentAccount.accountDetails.accountNumber,
      bankCode: user.paymentAccount.accountDetails.bankCode,
      momoNumber: user.paymentAccount.accountDetails.momoNumber,
      momoProvider: user.paymentAccount.accountDetails.momoProvider
    };

    console.log('🏗️ Creating apartment with data:', {
      title,
      ownerId: user.clerkId,
      ownerName: calculatedOwnerName,
      ownerEmail: user.email,
      location,
      price,
      totalRooms
    });

    const apartment = new Apartment({
      title,
      description,
      location,
      price,
      totalRooms,
      availableRooms: totalRooms, // Initially all rooms are available
      images,
      amenities,
      ownerId: user.clerkId,
      ownerName: calculatedOwnerName,
      ownerEmail: user.email,
      ownerPaymentAccount
    });

    console.log('💾 Saving apartment to database...');
    await apartment.save();

    console.log('✅ Apartment created successfully:', {
      id: apartment._id,
      title: apartment.title,
      ownerId: apartment.ownerId,
      ownerName: apartment.ownerName,
      createdAt: apartment.createdAt
    });

    // Send notification to admin about new apartment listing
    try {
      await NotificationService.createNewApartmentNotification({
        apartmentId: (apartment._id as any).toString(),
        title: apartment.title,
        ownerId: apartment.ownerId,
        ownerName: apartment.ownerName,
        location: `${apartment.location.town}, ${apartment.location.region}, ${apartment.location.country}`
      });
    } catch (notificationError) {
      console.error('⚠️ Failed to send admin notification for new apartment:', notificationError);
      // Don't fail the apartment creation if notification fails
    }

    res.status(201).json({
      message: 'Apartment created successfully',
      apartment
    });
  } catch (error) {
    console.error('Error creating apartment:', error);
    res.status(500).json({ error: 'Failed to create apartment' });
  }
};

// Update apartment (owner only)
export const updateApartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const apartment = await Apartment.findById(id);

    if (!apartment) {
      res.status(404).json({ error: 'Apartment not found' });
      return;
    }

    // Check if user owns this apartment
    const reqUser = (req as any).user;
    if (!reqUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (apartment.ownerId !== reqUser.clerkId && reqUser.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to update this apartment' });
      return;
    }

    // Prevent updating certain fields
    delete updates.ownerId;
    delete updates.ownerName;
    delete updates.ownerEmail;
    delete updates.rating;
    delete updates.reviews;

    Object.assign(apartment, updates);
    await apartment.save();

    res.json({
      message: 'Apartment updated successfully',
      apartment
    });
  } catch (error) {
    console.error('Error updating apartment:', error);
    res.status(500).json({ error: 'Failed to update apartment' });
  }
};

// Delete apartment (owner only)
export const deleteApartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const apartment = await Apartment.findById(id);

    if (!apartment) {
      res.status(404).json({ error: 'Apartment not found' });
      return;
    }

    // Check if user owns this apartment
    const reqUser = (req as any).user;
    if (!reqUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (apartment.ownerId !== reqUser.clerkId && reqUser.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to delete this apartment' });
      return;
    }

    // Soft delete by setting isActive to false
    apartment.isActive = false;
    await apartment.save();

    res.json({ message: 'Apartment deleted successfully' });
  } catch (error) {
    console.error('Error deleting apartment:', error);
    res.status(500).json({ error: 'Failed to delete apartment' });
  }
};

// Get apartments owned by current user
export const getMyApartments = async (req: Request, res: Response) => {
  try {
    const reqUser = (req as any).user;
    console.log('🏠 Getting apartments for user:', reqUser?.clerkId);
    console.log('👤 User details:', {
      clerkId: reqUser?.clerkId,
      email: reqUser?.email,
      role: reqUser?.role
    });

    if (!reqUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    console.log('🔍 Searching for apartments with ownerId:', reqUser.clerkId);

    // Debug: Check what apartments exist in the database
    const allApartments = await Apartment.find({}).select('title ownerId createdAt').sort({ createdAt: -1 }).limit(10);
    console.log('🗂️ Recent apartments in database:');
    allApartments.forEach((apt, i) => {
      console.log(`   ${i + 1}. "${apt.title}" - Owner: ${apt.ownerId} - Created: ${apt.createdAt}`);
    });

    const [apartments, total] = await Promise.all([
      Apartment.find({ ownerId: reqUser.clerkId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Apartment.countDocuments({ ownerId: reqUser.clerkId })
    ]);

    console.log('📊 Found apartments for user:', apartments.length, 'Total:', total);
    if (apartments.length > 0) {
      console.log('✅ User apartments:');
      apartments.forEach((apt, i) => {
        console.log(`   ${i + 1}. "${apt.title}" - Created: ${apt.createdAt}`);
      });
    } else {
      console.log('❌ No apartments found for this user');
    }

    res.json({
      apartments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching user apartments:', error);
    res.status(500).json({ error: 'Failed to fetch your apartments' });
  }
};
