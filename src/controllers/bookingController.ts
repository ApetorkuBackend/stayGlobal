import { Request, Response } from 'express';
import Booking, { IBooking } from '../models/Booking';
import Apartment from '../models/Apartment';
import User from '../models/User';
import Commission from '../models/Commission';
import { syncUserWithClerk } from '../utils/userUtils';
import biometricService from '../services/biometricService';
import ChatService from '../services/chatService';
import NotificationService from '../services/notificationService';

// Helper function to get next available room number
const getNextAvailableRoom = async (apartmentId: string, checkIn: Date, checkOut: Date, excludeBookingId?: string): Promise<number> => {
  const apartment = await Apartment.findById(apartmentId);
  if (!apartment) {
    throw new Error('Apartment not found');
  }

  console.log(`🔍 Finding available room for apartment ${apartmentId} from ${checkIn.toISOString()} to ${checkOut.toISOString()}`);

  // Get all bookings that overlap with the requested dates and have assigned rooms
  const query: any = {
    apartmentId,
    $or: [
      {
        checkIn: { $lte: checkOut },
        checkOut: { $gte: checkIn }
      }
    ],
    bookingStatus: { $in: ['confirmed', 'checked-in', 'completed'] },
    roomNumber: { $exists: true, $ne: null }
  };

  // Exclude current booking if provided (for updates)
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const overlappingBookings = await Booking.find(query).select('roomNumber guestName checkIn checkOut');

  console.log(`📋 Found ${overlappingBookings.length} overlapping bookings with assigned rooms:`);
  overlappingBookings.forEach(booking => {
    console.log(`   Room ${booking.roomNumber}: ${booking.guestName} (${booking.checkIn.toDateString()} - ${booking.checkOut.toDateString()})`);
  });

  // Get occupied room numbers
  const occupiedRooms = new Set(overlappingBookings.map(booking => booking.roomNumber));

  console.log(`🚫 Occupied rooms: [${Array.from(occupiedRooms).sort().join(', ')}]`);

  // Find the first available room number
  for (let roomNum = 1; roomNum <= apartment.totalRooms; roomNum++) {
    if (!occupiedRooms.has(roomNum)) {
      console.log(`✅ Assigned room ${roomNum} (first available)`);
      return roomNum;
    }
  }

  console.log(`❌ No rooms available - all ${apartment.totalRooms} rooms are occupied`);
  throw new Error(`No rooms available for the selected dates. All ${apartment.totalRooms} rooms are currently occupied.`);
};

// Helper function to get room occupancy status
const getRoomOccupancyStatus = async (apartmentId: string, checkIn: Date, checkOut: Date) => {
  const apartment = await Apartment.findById(apartmentId);
  if (!apartment) {
    throw new Error('Apartment not found');
  }

  // Get all bookings that overlap with the requested dates and have assigned rooms
  const overlappingBookings = await Booking.find({
    apartmentId,
    $or: [
      {
        checkIn: { $lte: checkOut },
        checkOut: { $gte: checkIn }
      }
    ],
    bookingStatus: { $in: ['confirmed', 'checked-in', 'completed'] },
    roomNumber: { $exists: true, $ne: null }
  }).select('roomNumber guestName checkIn checkOut bookingStatus');

  const occupiedRooms = new Map();
  overlappingBookings.forEach(booking => {
    occupiedRooms.set(booking.roomNumber, {
      guestName: booking.guestName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      status: booking.bookingStatus
    });
  });

  const roomStatus = [];
  for (let roomNum = 1; roomNum <= apartment.totalRooms; roomNum++) {
    const occupant = occupiedRooms.get(roomNum);
    roomStatus.push({
      roomNumber: roomNum,
      isOccupied: !!occupant,
      occupant: occupant || null
    });
  }

  return {
    totalRooms: apartment.totalRooms,
    availableRooms: apartment.totalRooms - occupiedRooms.size,
    occupiedRooms: occupiedRooms.size,
    roomStatus
  };
};

// Mobile money validation function
const validateMomoNumber = (number: string, provider: string): boolean => {
  const cleanNumber = number.replace(/\s+/g, '');

  switch (provider) {
    case 'mtn':
      return /^(0?24|0?54|0?55|0?59)\d{7}$/.test(cleanNumber);
    case 'vodafone':
      return /^(0?20|0?50)\d{7}$/.test(cleanNumber);
    case 'airteltigo':
      return /^(0?26|0?27|0?56|0?57)\d{7}$/.test(cleanNumber);
    default:
      return false;
  }
};

// Create new booking
export const createBooking = async (req: Request, res: Response): Promise<void> => {
  console.log('🎯🎯🎯 BOOKING CONTROLLER HIT - createBooking function! 🎯🎯🎯');
  console.log('🎯 Booking request received!');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('User:', req.user);

  try {
    const {
      apartmentId,
      checkIn,
      checkOut,
      guests,
      specialRequests
    } = req.body;

    // Basic validation
    if (!apartmentId) {
      console.log('❌ Missing apartmentId');
      res.status(400).json({ error: 'Apartment ID is required' });
      return;
    }

    if (!checkIn) {
      console.log('❌ Missing checkIn');
      res.status(400).json({ error: 'Check-in date is required' });
      return;
    }

    if (!checkOut) {
      console.log('❌ Missing checkOut');
      res.status(400).json({ error: 'Check-out date is required' });
      return;
    }

    if (!guests || guests < 1) {
      console.log('❌ Invalid guests:', guests);
      res.status(400).json({ error: 'Number of guests must be at least 1' });
      return;
    }

    // Get user data from authenticated request (database validation)
    const userClerkId = req.user?.clerkId;
    if (!userClerkId) {
      console.log('❌ No authenticated user');
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Validate user exists in database
    const user = await User.findOne({ clerkId: userClerkId });
    if (!user) {
      console.log('❌ User not found in database:', userClerkId);
      res.status(404).json({ error: 'User not found in database' });
      return;
    }

    // Validate apartment
    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) {
      console.log('❌ Apartment not found:', apartmentId);
      res.status(404).json({ error: 'Apartment not found' });
      return;
    }

    if (!apartment.isActive) {
      console.log('❌ Apartment not active');
      res.status(400).json({ error: 'Apartment is not available' });
      return;
    }

    // Check if apartment owner has payment account setup by looking up the owner
    let owner;
    try {
      owner = await User.findOne({ clerkId: apartment.ownerId });
      console.log('🔍 Looking for owner with clerkId:', apartment.ownerId);
      console.log('🔍 Owner found:', !!owner);
    } catch (error) {
      console.error('❌ Error finding owner:', error);
      res.status(500).json({
        error: 'Database error',
        message: 'Error looking up property owner information.'
      });
      return;
    }

    if (!owner) {
      console.log('❌ Apartment owner not found for clerkId:', apartment.ownerId);
      res.status(400).json({
        error: 'Owner not found',
        message: 'Property owner information not found. Please contact support.'
      });
      return;
    }

    // Check if owner is suspended
    if (owner.status === 'suspended') {
      console.log('❌ Owner is suspended');
      res.status(400).json({
        error: 'Property unavailable',
        message: 'This property is temporarily unavailable for booking. Please try another property.'
      });
      return;
    }

    // Check if owner has verified payment account
    if (!owner.paymentAccount?.isVerified) {
      console.log('❌ Owner has no verified payment account');
      res.status(400).json({
        error: 'Payment account not configured',
        message: 'This property owner has not set up their payment account yet. Bookings are not available for this property. Please try another property or contact the owner.'
      });
      return;
    }

    // For Paystack, ensure subaccount code exists
    if (owner.paymentAccount.provider === 'paystack' && !owner.paymentAccount.accountDetails?.subaccountCode) {
      console.log('❌ Paystack owner missing subaccount code');
      res.status(400).json({
        error: 'Payment configuration incomplete',
        message: 'This property owner has incomplete payment setup. Bookings are not available for this property. Please try another property.'
      });
      return;
    }

    console.log('✅ Owner has verified payment account:', {
      provider: owner.paymentAccount.provider,
      hasSubaccount: !!owner.paymentAccount.accountDetails?.subaccountCode
    });

    // Simple date validation - avoid timezone issues
    const checkInDate = new Date(checkIn + 'T12:00:00.000Z');
    const checkOutDate = new Date(checkOut + 'T12:00:00.000Z');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (checkInDate < today) {
      console.log('❌ Check-in date in past');
      res.status(400).json({ error: 'Check-in date cannot be in the past' });
      return;
    }

    if (checkOutDate <= checkInDate) {
      console.log('❌ Invalid date range');
      res.status(400).json({ error: 'Check-out date must be after check-in date' });
      return;
    }

    // Check room availability for the requested dates
    try {
      await getNextAvailableRoom(apartmentId, checkInDate, checkOutDate);
      console.log('✅ Room availability confirmed');
    } catch (error) {
      console.log('❌ No rooms available:', (error as Error).message);
      res.status(400).json({
        error: 'No rooms available',
        message: (error as Error).message || 'All rooms are booked for the selected dates'
      });
      return;
    }

    // Calculate total amount
    const days = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalAmount = days * apartment.price;

    console.log('✅ Creating booking with validated data');

    // Generate unique ticket code
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 6).toUpperCase();
    const ticketCode = `BK${timestamp}${randomStr}`;

    // Extract payment information from request
    const { paymentReference, paymentStatus } = req.body;

    // Create booking with payment information (using database user data)
    const guestName = user.fullName || `${user.firstName} ${user.lastName}`;

    console.log('👤 Guest Information:');
    console.log(`   Guest ID: ${user.clerkId}`);
    console.log(`   Guest Name: ${guestName}`);
    console.log(`   Guest Email: ${user.email}`);
    console.log('🏠 Owner Information:');
    console.log(`   Owner ID: ${apartment.ownerId}`);
    console.log(`   Owner Name: ${apartment.ownerName}`);

    const bookingData = {
      apartmentId,
      guestId: user.clerkId,
      guestName,
      guestEmail: user.email,
      guestPhone: user.phone || '',
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests: Number(guests),
      totalAmount,
      paymentMethod: paymentReference ? 'paystack' : 'none',
      paymentStatus: paymentStatus || (paymentReference ? 'completed' : 'not_required'),
      paymentReference: paymentReference || null,
      bookingStatus: 'confirmed',
      ticketCode,
      specialRequests: specialRequests || ''
    };

    console.log('📝 Final booking data:', JSON.stringify(bookingData, null, 2));

    // Create booking without Mongoose validation that might be causing issues
    const booking = await Booking.create(bookingData);

    console.log('✅ Booking saved successfully');

    // Populate apartment details
    await booking.populate('apartmentId', 'title location images');

    // Send notifications about new booking
    try {
      console.log('📧 Starting notification process for new booking...');
      console.log(`   Booking ID: ${booking._id}`);
      console.log(`   Guest: ${booking.guestName}`);
      console.log(`   Apartment: ${apartment.title}`);
      console.log(`   Owner ID: ${apartment.ownerId}`);
      console.log(`   Owner Name: ${apartment.ownerName}`);

      // Send notification to admin
      console.log('📧 Sending notification to admin...');
      await NotificationService.createNewBookingNotification({
        bookingId: (booking._id as any).toString(),
        apartmentId: (apartment._id as any).toString(),
        apartmentTitle: apartment.title,
        guestName: booking.guestName,
        ownerId: apartment.ownerId,
        ownerName: apartment.ownerName,
        roomNumber: booking.roomNumber,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut
      });
      console.log('✅ Admin notification sent successfully');

      // Send notification to house owner
      console.log('📧 Sending notification to house owner...');
      console.log(`   Notification will be sent to owner: ${apartment.ownerId} (${apartment.ownerName})`);
      console.log(`   About guest: ${booking.guestName} (${booking.guestId})`);
      console.log(`   Apartment: ${apartment.title}`);

      const ownerNotificationMessage = `${booking.guestName} has booked your apartment "${apartment.title}"${booking.roomNumber ? ` - Room ${booking.roomNumber}` : ''} from ${booking.checkIn.toLocaleDateString()} to ${booking.checkOut.toLocaleDateString()}`;
      console.log(`   Message: ${ownerNotificationMessage}`);

      await NotificationService.createNotification({
        userId: apartment.ownerId,
        type: 'new_booking',
        title: '🎉 New Booking Received!',
        message: ownerNotificationMessage,
        bookingId: (booking._id as any).toString(),
        apartmentId: (apartment._id as any).toString(),
        guestName: booking.guestName,
        roomNumber: booking.roomNumber,
        priority: 'high'
      });
      console.log('✅ House owner notification sent successfully');

      console.log('✅ All notifications sent successfully for new booking');
    } catch (notificationError) {
      console.error('⚠️ Failed to send notifications for new booking:', notificationError);
      console.error('   Error details:', (notificationError as Error).message);
      console.error('   Stack trace:', (notificationError as Error).stack);
      // Don't fail the booking creation if notification fails
    }

    // Create chat for the booking
    try {
      await ChatService.getOrCreateChat((booking._id as string).toString());
      console.log('✅ Chat created for booking');
    } catch (error) {
      console.error('⚠️ Failed to create chat for booking:', error);
      // Don't fail the booking creation if chat creation fails
    }

    // Create commission record for bookings with successful payments
    // Accept both 'completed' and 'paid' status, and create commission even without payment reference for tracking
    const shouldCreateCommission = paymentStatus === 'completed' || paymentStatus === 'paid';

    if (shouldCreateCommission && totalAmount > 0) {
      try {
        const commissionRate = 0.05; // 5%
        const commissionAmount = totalAmount * commissionRate;

        const commission = new Commission({
          bookingId: booking._id,
          apartmentId: booking.apartmentId,
          ownerId: apartment.ownerId,
          guestId: booking.guestId,
          roomPrice: totalAmount,
          commissionRate,
          commissionAmount,
          bookingDate: booking.createdAt,
          checkInDate: booking.checkIn,
          checkOutDate: booking.checkOut,
          paymentReference: paymentReference || `booking_${booking._id}`, // Use booking ID if no payment reference
          status: paymentReference ? 'pending' : 'manual_review' // Different status for bookings without payment reference
        });

        await commission.save();
        console.log(`💰 Commission created for ${paymentStatus} booking: GHS ${commissionAmount.toFixed(2)} (5% of GHS ${totalAmount})`);
        console.log(`💳 Payment reference: ${paymentReference || 'booking_' + booking._id}`);
        console.log(`📊 Commission status: ${commission.status}`);
      } catch (error) {
        console.error('⚠️ Failed to create commission record:', error);
        // Don't fail the booking creation if commission creation fails
      }
    } else {
      console.log('ℹ️ No commission created - booking has no payment or amount is 0');
      console.log(`   Payment Status: ${paymentStatus || 'none'}`);
      console.log(`   Payment Reference: ${paymentReference || 'none'}`);
      console.log(`   Total Amount: ${totalAmount || 0}`);
    }

    res.status(201).json({
      message: 'Booking created successfully',
      booking
    });

  } catch (error: any) {
    console.error('❌ Error creating booking:', error);
    console.error('Error details:', error.message);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map((err: any) => err.message);
      console.log('❌ Mongoose validation errors:', validationErrors);
      res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to create booking',
      details: error.message
    });
  }
};

// Get user's bookings
export const getMyBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📋 Getting bookings for user:', req.user.clerkId);
    const { page = 1, limit = 10, status } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, unknown> = { guestId: req.user.clerkId };
    if (status) {
      filter.bookingStatus = status;
    }

    console.log('🔍 Booking filter:', filter);

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('apartmentId', 'title location images price')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Booking.countDocuments(filter)
    ]);

    console.log(`📊 Found ${bookings.length} bookings for user (total: ${total})`);
    if (bookings.length > 0) {
      console.log('📋 Sample booking:', {
        id: bookings[0]._id,
        guestId: bookings[0].guestId,
        apartmentId: bookings[0].apartmentId,
        paymentStatus: bookings[0].paymentStatus,
        bookingStatus: bookings[0].bookingStatus,
        createdAt: bookings[0].createdAt
      });
    }

    res.json({
      bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user bookings:', error);
    res.status(500).json({ error: 'Failed to fetch your bookings' });
  }
};

// Get single booking by ID
export const getBookingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate('apartmentId', 'title location images price ownerName ownerEmail');

    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // Check if user owns this booking or is the apartment owner
    const apartment = await Apartment.findById(booking.apartmentId);
    const isOwner = apartment && apartment.ownerId === req.user.clerkId;
    const isGuest = booking.guestId === req.user.clerkId;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isGuest && !isAdmin) {
      res.status(403).json({ error: 'Not authorized to view this booking' });
      return;
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
};

// Cancel booking
export const cancelBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // Check if user owns this booking
    if (booking.guestId !== req.user.clerkId && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to cancel this booking' });
      return;
    }

    // Check if booking can be cancelled
    if (booking.bookingStatus === 'cancelled') {
      res.status(400).json({ error: 'Booking is already cancelled' });
      return;
    }

    if (booking.bookingStatus === 'completed') {
      res.status(400).json({ error: 'Cannot cancel completed booking' });
      return;
    }

    // Check cancellation policy (24 hours before check-in)
    const now = new Date();
    const checkIn = new Date(booking.checkIn);
    const hoursUntilCheckIn = (checkIn.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilCheckIn < 24) {
      res.status(400).json({
        error: 'Cannot cancel booking less than 24 hours before check-in'
      });
      return;
    }

    // Cancel booking
    booking.bookingStatus = 'cancelled';
    await booking.save();

    // Restore apartment availability
    const apartment = await Apartment.findById(booking.apartmentId);
    if (apartment) {
      apartment.availableRooms += 1;
      await apartment.save();
    }

    res.json({
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

// Get all bookings for apartments owned by the current user
export const getOwnerBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📅 Getting bookings for owner:', req.user.clerkId);
    const { page = 1, limit = 100, status } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // First, get all apartments owned by the current user
    const userApartments = await Apartment.find({ ownerId: req.user.clerkId }).select('_id');
    const apartmentIds = userApartments.map(apt => apt._id);
    console.log('🏠 User apartments found:', userApartments.length);

    if (apartmentIds.length === 0) {
      // User has no apartments, return empty result
      res.json({
        bookings: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          pages: 0
        }
      });
      return;
    }

    // Build filter for bookings
    const filter: Record<string, unknown> = { apartmentId: { $in: apartmentIds } };
    if (status) {
      filter.bookingStatus = status;
    }

    console.log('🔍 Booking filter for owner:', filter);

    // Get bookings for all user's apartments
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('apartmentId', 'title location images price')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Booking.countDocuments(filter)
    ]);

    console.log(`📊 Found ${bookings.length} bookings for owner (total: ${total})`);
    if (bookings.length > 0) {
      console.log('📋 Sample owner booking:', {
        id: bookings[0]._id,
        guestId: bookings[0].guestId,
        apartmentId: bookings[0].apartmentId,
        paymentStatus: bookings[0].paymentStatus,
        bookingStatus: bookings[0].bookingStatus,
        createdAt: bookings[0].createdAt
      });
    }

    res.json({
      bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching owner bookings:', error);
    res.status(500).json({ error: 'Failed to fetch owner bookings' });
  }
};

// Get bookings for apartment owner
export const getApartmentBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { apartmentId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    // Verify apartment ownership
    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) {
      res.status(404).json({ error: 'Apartment not found' });
      return;
    }

    if (apartment.ownerId !== req.user.clerkId && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to view these bookings' });
      return;
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, unknown> = { apartmentId };
    if (status) {
      filter.bookingStatus = status;
    }

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Booking.countDocuments(filter)
    ]);

    res.json({
      bookings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching apartment bookings:', error);
    res.status(500).json({ error: 'Failed to fetch apartment bookings' });
  }
};

// Update booking payment status (for payment processing)
export const updatePaymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // Only allow certain payment status updates
    const allowedStatuses = ['paid', 'failed', 'refunded'];
    if (!allowedStatuses.includes(paymentStatus)) {
      res.status(400).json({ error: 'Invalid payment status' });
      return;
    }

    booking.paymentStatus = paymentStatus;
    await booking.save();

    res.json({
      message: 'Payment status updated successfully',
      booking
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
};

// Get booking by ticket code
export const getBookingByTicketCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticketCode } = req.params;

    const booking = await Booking.findOne({ ticketCode })
      .populate('apartmentId', 'title')
      .lean();

    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // Check if user is the owner of the apartment or admin
    if (req.user.role !== 'admin') {
      const apartment = await Apartment.findById(booking.apartmentId);
      if (!apartment || apartment.ownerId !== req.user.clerkId) {
        res.status(403).json({ error: 'Not authorized to view this booking' });
        return;
      }
    }

    // Add apartment title to response
    const bookingWithDetails = {
      ...booking,
      apartmentTitle: typeof booking.apartmentId === 'object' && 'title' in booking.apartmentId
        ? (booking.apartmentId as { title: string }).title
        : 'Unknown Apartment'
    };

    res.json(bookingWithDetails);
  } catch (error) {
    console.error('Error fetching booking by ticket code:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
};

// Update booking status (for check-in/check-out)
export const updateBookingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(`🔄 Updating booking status - ID: ${req.params.id}, Status: ${req.body.status}`);

    const { id } = req.params;
    const { status } = req.body;

    if (!['confirmed', 'checked-in', 'completed', 'cancelled'].includes(status)) {
      console.log(`❌ Invalid status: ${status}`);
      res.status(400).json({ error: 'Invalid booking status' });
      return;
    }

    console.log(`🔍 Finding booking with ID: ${id}`);
    const booking = await Booking.findById(id);
    if (!booking) {
      console.log(`❌ Booking not found: ${id}`);
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    console.log(`✅ Booking found: ${booking.guestName} - Current status: ${booking.bookingStatus}`);

    // Check if guest is already checked in
    if (status === 'checked-in' && booking.bookingStatus === 'checked-in') {
      console.log(`⚠️ Guest ${booking.guestName} is already checked in to room ${booking.roomNumber}`);
      res.status(400).json({
        error: 'Guest already checked in',
        message: `${booking.guestName} is already checked in to Room ${booking.roomNumber}`,
        roomNumber: booking.roomNumber,
        checkInTime: booking.checkInTime
      });
      return;
    }

    // Check if user is the owner of the apartment or admin
    if (req.user.role !== 'admin') {
      const apartment = await Apartment.findById(booking.apartmentId);
      if (!apartment || apartment.ownerId !== req.user.clerkId) {
        res.status(403).json({ error: 'Not authorized to update this booking' });
        return;
      }
    }

    // Update booking status
    booking.bookingStatus = status;

    // Handle check-in: assign room number and set check-in time
    if (status === 'checked-in' && !booking.roomNumber) {
      console.log(`🔄 Attempting to assign room for booking ${booking._id}`);
      console.log(`📅 Booking dates: ${booking.checkIn} to ${booking.checkOut}`);
      console.log(`🏠 Apartment ID: ${booking.apartmentId}`);

      try {
        const roomNumber = await getNextAvailableRoom(
          booking.apartmentId.toString(),
          booking.checkIn,
          booking.checkOut,
          (booking._id as string).toString()
        );
        booking.roomNumber = roomNumber;
        booking.checkInTime = new Date();
        console.log(`✅ Assigned room ${roomNumber} to booking ${booking._id}`);
      } catch (error) {
        console.error('❌ Error assigning room:', error);
        console.error('❌ Error stack:', (error as Error).stack);
        res.status(400).json({
          error: (error as Error).message || 'Failed to assign room',
          details: (error as Error).stack
        });
        return;
      }
    }

    // Handle check-out: set check-out time
    if (status === 'completed' && booking.checkInTime && !booking.checkOutTime) {
      booking.checkOutTime = new Date();
      console.log(`✅ Checked out booking ${booking._id} from room ${booking.roomNumber}`);
    }

    console.log(`💾 Saving booking with updated status: ${status}`);
    await booking.save();

    console.log(`✅ Booking status updated successfully to: ${status}`);
    res.json({
      message: 'Booking status updated successfully',
      booking
    });
  } catch (error) {
    console.error('❌ Error updating booking status:', error);
    console.error('❌ Error details:', (error as Error).message);
    console.error('❌ Error stack:', (error as Error).stack);
    res.status(500).json({
      error: 'Failed to update booking status',
      details: (error as Error).message,
      stack: (error as Error).stack
    });
  }
};

// Create secure booking with biometric verification
export const createSecureBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      apartmentId,
      checkIn,
      checkOut,
      guests,
      paymentMethod,
      specialRequests,
      fingerprintData // Required for payment authorization
    } = req.body;

    // Sync user with Clerk to get latest data
    const user = await syncUserWithClerk(req.user.clerkId);

    // Verify user's identity is verified
    if (!user.identityVerification?.isVerified) {
      res.status(403).json({
        error: 'Identity verification required',
        message: 'You must complete identity verification before making bookings'
      });
      return;
    }

    // Verify fingerprint for payment authorization
    if (!fingerprintData) {
      res.status(400).json({
        error: 'Biometric verification required',
        message: 'Fingerprint verification is required for payment authorization'
      });
      return;
    }

    try {
      const biometricResult = await biometricService.verifyFingerprint({
        userId: user.clerkId,
        fingerprintData,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.headers['x-session-id'] as string || 'unknown'
        }
      });

      if (!biometricResult.isMatch) {
        res.status(401).json({
          error: 'Biometric verification failed',
          message: 'Fingerprint verification failed. Payment authorization denied.',
          confidence: biometricResult.confidence
        });
        return;
      }
    } catch (biometricError) {
      res.status(401).json({
        error: 'Biometric verification failed',
        message: 'Unable to verify fingerprint. Please try again.'
      });
      return;
    }

    // Validate apartment exists and is available
    const apartment = await Apartment.findById(apartmentId);
    if (!apartment) {
      res.status(404).json({ error: 'Apartment not found' });
      return;
    }

    if (!apartment.isActive) {
      res.status(400).json({ error: 'Apartment is not available' });
      return;
    }

    // Check if apartment owner is suspended
    const owner = await User.findOne({ clerkId: apartment.ownerId });
    if (!owner) {
      res.status(400).json({
        error: 'Owner not found',
        message: 'Property owner information not found. Please contact support.'
      });
      return;
    }

    if (owner.status === 'suspended') {
      res.status(400).json({
        error: 'Property unavailable',
        message: 'This property is temporarily unavailable for booking. Please try another property.'
      });
      return;
    }

    // Verify apartment owner has verified payment account
    if (!apartment.ownerPaymentAccount) {
      res.status(400).json({
        error: 'Payment not available',
        message: 'Property owner has not set up payment account'
      });
      return;
    }

    // Validate dates and availability (same as regular booking)
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const now = new Date();

    if (checkInDate < now) {
      res.status(400).json({ error: 'Check-in date cannot be in the past' });
      return;
    }

    if (checkOutDate <= checkInDate) {
      res.status(400).json({ error: 'Check-out date must be after check-in date' });
      return;
    }

    // Check for overlapping bookings
    const overlappingBookings = await Booking.find({
      apartmentId,
      bookingStatus: { $in: ['confirmed', 'completed'] },
      $or: [
        {
          checkIn: { $lte: checkInDate },
          checkOut: { $gt: checkInDate }
        },
        {
          checkIn: { $lt: checkOutDate },
          checkOut: { $gte: checkOutDate }
        },
        {
          checkIn: { $gte: checkInDate },
          checkOut: { $lte: checkOutDate }
        }
      ]
    });

    if (overlappingBookings.length >= apartment.availableRooms) {
      res.status(400).json({ error: 'No rooms available for selected dates' });
      return;
    }

    // Calculate total amount
    const days = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalAmount = days * apartment.price;

    // Create booking with biometric verification flag
    const booking = new Booking({
      apartmentId,
      guestId: user.clerkId,
      guestName: user.fullName,
      guestEmail: user.email,
      guestPhone: user.phone || '',
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests,
      totalAmount,
      paymentMethod,
      specialRequests,
      // Add metadata to track biometric verification
      metadata: {
        biometricVerified: true,
        verificationTimestamp: new Date(),
        paymentAuthorized: true
      }
    });

    await booking.save();

    // Create chat for the booking
    try {
      await ChatService.getOrCreateChat((booking._id as string).toString());
      console.log('✅ Chat created for secure booking');
    } catch (error) {
      console.error('⚠️ Failed to create chat for secure booking:', error);
      // Don't fail the booking creation if chat creation fails
    }

    // Update apartment available rooms
    apartment.availableRooms -= 1;
    await apartment.save();

    res.status(201).json({
      message: 'Secure booking created successfully with biometric verification',
      booking: {
        id: booking._id,
        apartmentId: booking.apartmentId,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        totalAmount: booking.totalAmount,
        ticketCode: booking.ticketCode,
        paymentMethod: booking.paymentMethod,
        biometricVerified: true
      },
      paymentInfo: {
        ownerPaymentAccount: apartment.ownerPaymentAccount,
        directPayment: true,
        secureTransaction: true
      }
    });

  } catch (error) {
    console.error('Error creating secure booking:', error);
    res.status(500).json({ error: 'Failed to create secure booking' });
  }
};

// Get room availability status for an apartment
export const getRoomAvailability = async (req: Request, res: Response): Promise<void> => {
  try {
    const { apartmentId } = req.params;
    const { checkIn, checkOut } = req.query;

    if (!checkIn || !checkOut) {
      res.status(400).json({ error: 'Check-in and check-out dates are required' });
      return;
    }

    const checkInDate = new Date(checkIn as string + 'T12:00:00.000Z');
    const checkOutDate = new Date(checkOut as string + 'T12:00:00.000Z');

    const roomStatus = await getRoomOccupancyStatus(apartmentId, checkInDate, checkOutDate);

    res.json({
      message: 'Room availability retrieved successfully',
      ...roomStatus,
      dateRange: {
        checkIn: checkInDate,
        checkOut: checkOutDate
      }
    });
  } catch (error) {
    console.error('Error getting room availability:', error);
    res.status(500).json({ error: 'Failed to get room availability' });
  }
};

// Self-checkout for renters
export const selfCheckout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: bookingId } = req.params;
    const userId = req.user.clerkId;

    console.log(`🚪 Self-checkout requested by user ${userId} for booking ${bookingId}`);

    // Find the booking
    const booking = await Booking.findById(bookingId).populate('apartmentId');
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    // Verify the user owns this booking
    if (booking.guestId !== userId) {
      res.status(403).json({ error: 'You can only check out your own bookings' });
      return;
    }

    // Check if booking is in checked-in status
    if (booking.bookingStatus !== 'checked-in') {
      res.status(400).json({
        error: `Cannot check out. Booking status is '${booking.bookingStatus}'. Only checked-in bookings can be checked out.`
      });
      return;
    }

    // Check if already checked out
    if (booking.checkOutTime) {
      res.status(400).json({
        error: 'You have already checked out of this booking',
        checkOutTime: booking.checkOutTime
      });
      return;
    }

    const apartment = booking.apartmentId as any;
    const checkoutTime = new Date();

    // Update booking status to completed and set checkout time
    booking.bookingStatus = 'completed';
    booking.checkOutTime = checkoutTime;
    await booking.save();

    console.log(`✅ Self-checkout completed for booking ${bookingId} - Room ${booking.roomNumber}`);

    // Create notification for the house owner
    try {
      await NotificationService.createNotification({
        userId: apartment.ownerId,
        type: 'auto_checkout',
        title: 'Guest Self-Checkout',
        message: `${booking.guestName} has checked out early from ${apartment.title}${booking.roomNumber ? ` - Room ${booking.roomNumber}` : ''} at ${checkoutTime.toLocaleString()}.`,
        bookingId: (booking._id as string).toString(),
        apartmentId: apartment._id.toString(),
        guestName: booking.guestName,
        roomNumber: booking.roomNumber,
        priority: 'medium'
      });

      console.log(`📧 Self-checkout notification sent to owner ${apartment.ownerId}`);
    } catch (notificationError) {
      console.error('❌ Failed to send self-checkout notification:', notificationError);
      // Don't fail the checkout if notification fails
    }

    res.json({
      message: 'Successfully checked out',
      booking: {
        id: booking._id,
        apartmentTitle: apartment.title,
        roomNumber: booking.roomNumber,
        checkOutTime: booking.checkOutTime,
        bookingStatus: booking.bookingStatus,
        originalCheckOutDate: booking.checkOut,
        earlyCheckout: checkoutTime < booking.checkOut
      }
    });

  } catch (error) {
    console.error('❌ Error during self-checkout:', error);
    res.status(500).json({ error: 'Failed to process checkout' });
  }
};
