import { Request, Response } from 'express';
import Payment from '../models/Payment';
import Booking from '../models/Booking';
import Apartment from '../models/Apartment';
import User from '../models/User';
import paystackService from '../services/paystackService';
import { syncUserWithClerk } from '../utils/userUtils';
import { PaymentMetadata, PaymentData } from '../types/payment';

// Initialize payment for a booking
export const initializePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, paymentMethod } = req.body;
    
    // Get user info
    const user = await syncUserWithClerk(req.user.clerkId);
    
    // Get booking details
    const booking = await Booking.findById(bookingId).populate('apartmentId');
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    const apartment = booking.apartmentId as any;
    if (!apartment) {
      res.status(404).json({ error: 'Apartment not found' });
      return;
    }

    // Get apartment owner details
    const owner = await User.findOne({ clerkId: apartment.ownerId });
    if (!owner) {
      res.status(404).json({ error: 'Apartment owner not found' });
      return;
    }

    // Check if owner has payment account set up
    if (!owner.paymentAccount || !owner.paymentAccount.isVerified) {
      res.status(400).json({
        error: 'Owner has not set up payment account. Please contact the property owner.'
      });
      return;
    }

    // Ensure apartment has payment account details (use apartment's stored payment info for consistency)
    if (paymentMethod === 'paystack' && !apartment.ownerPaymentAccount?.subaccountCode) {
      res.status(400).json({
        error: 'Apartment payment configuration missing',
        message: 'This apartment was not properly configured for payments. Please contact the owner.'
      });
      return;
    }

    // Calculate fees (10% platform fee, 90% to owner)
    const totalAmount = booking.totalAmount;
    const platformFee = paystackService.calculatePlatformFee(totalAmount, 10); // 10% platform fee
    const ownerAmount = paystackService.calculateOwnerAmount(totalAmount, platformFee);

    // Create payment record
    const payment = new Payment({
      bookingId: booking._id,
      payerId: user.clerkId,
      payeeId: apartment.ownerId,
      apartmentId: apartment._id,
      amount: totalAmount,
      currency: 'GHS',
      paymentMethod,
      platformFee,
      ownerAmount,
      metadata: {
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guests: booking.guests,
        apartmentTitle: apartment.title
      }
    });

    if (paymentMethod === 'paystack') {
      // Initialize Paystack transaction
      const reference = paystackService.generateReference();
      const amountInKobo = paystackService.convertToKobo(totalAmount);

      const paystackData = {
        email: user.email,
        amount: amountInKobo,
        reference,
        callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
        metadata: {
          bookingId: (booking._id as any).toString(),
          paymentId: (payment._id as any).toString(),
          apartmentTitle: apartment.title,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          ownerId: apartment.ownerId,
          ownerEmail: apartment.ownerEmail,
          platformFee: platformFee,
          ownerAmount: ownerAmount
        },
        subaccount: apartment.ownerPaymentAccount.subaccountCode,
        transaction_charge: paystackService.convertToKobo(platformFee),
        bearer: 'subaccount' as const
      };

      console.log('💳 Initializing split payment:', {
        totalAmount: totalAmount,
        platformFee: platformFee,
        ownerAmount: ownerAmount,
        subaccountCode: apartment.ownerPaymentAccount.subaccountCode,
        transactionCharge: paystackService.convertToKobo(platformFee)
      });

      const paystackResponse = await paystackService.initializeTransaction(paystackData);

      if (!paystackResponse.status) {
        res.status(400).json({ error: 'Failed to initialize payment' });
        return;
      }

      // Update payment with Paystack details
      payment.paystackReference = reference;
      payment.paystackSubaccountCode = apartment.ownerPaymentAccount.subaccountCode;
      payment.status = 'pending';

      await payment.save();

      // Update booking with payment reference
      booking.paymentId = payment._id as any;
      await booking.save();

      res.json({
        message: 'Payment initialized successfully',
        payment: {
          id: payment._id,
          reference,
          authorization_url: paystackResponse.data.authorization_url,
          access_code: paystackResponse.data.access_code,
          // Additional data for inline payment
          email: user.email,
          amount: amountInKobo,
          metadata: paystackData.metadata,
          subaccount: apartment.ownerPaymentAccount.subaccountCode,
          transaction_charge: paystackService.convertToKobo(platformFee),
          bearer: 'subaccount'
        }
      });

    } else if (paymentMethod === 'momo') {
      // For Mobile Money payments, validate that user provided momo details
      if (!booking.paymentDetails?.momoNumber || !booking.paymentDetails?.momoProvider) {
        res.status(400).json({ error: 'Mobile money account details are required' });
        return;
      }

      const reference = paystackService.generateReference();
      const amountInKobo = paystackService.convertToKobo(totalAmount);

      // For mobile money, we need to use Paystack's mobile money charge API
      // This will send actual USSD prompts to the user's phone
      const momoChargeData = {
        email: user.email,
        amount: amountInKobo,
        reference,
        phone: booking.paymentDetails.momoNumber,
        provider: booking.paymentDetails.momoProvider, // mtn, vodafone, airteltigo
        metadata: {
          bookingId: (booking._id as any).toString(),
          paymentId: (payment._id as any).toString(),
          apartmentTitle: apartment.title,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          mobile_money_number: booking.paymentDetails.momoNumber,
          mobile_money_provider: booking.paymentDetails.momoProvider.toUpperCase(),
          ownerId: apartment.ownerId,
          ownerEmail: apartment.ownerEmail,
          platformFee: platformFee,
          ownerAmount: ownerAmount
        },
        subaccount: apartment.ownerPaymentAccount.subaccountCode,
        transaction_charge: paystackService.convertToKobo(platformFee),
        bearer: 'subaccount' as const
      };

      console.log('📱 Initializing mobile money split payment:', {
        totalAmount: totalAmount,
        platformFee: platformFee,
        ownerAmount: ownerAmount,
        subaccountCode: apartment.ownerPaymentAccount.subaccountCode,
        momoProvider: booking.paymentDetails.momoProvider
      });

      // Use mobile money charge API to send USSD prompt to user's phone
      const momoResponse = await paystackService.chargeMobileMoney(momoChargeData);

      if (!momoResponse.status) {
        res.status(400).json({ error: 'Failed to initiate mobile money payment' });
        return;
      }

      // Update payment with Paystack details
      payment.paystackReference = reference;
      payment.paystackSubaccountCode = apartment.ownerPaymentAccount.subaccountCode;
      payment.status = 'pending';

      await payment.save();

      // Update booking with payment reference
      booking.paymentId = payment._id as any;
      await booking.save();

      res.json({
        message: 'Mobile Money payment initiated successfully',
        payment: {
          id: payment._id,
          reference,
          status: momoResponse.data.status,
          display_text: momoResponse.data.display_text || `Please check your phone (${booking.paymentDetails.momoNumber}) for a payment prompt and enter your ${booking.paymentDetails.momoProvider.toUpperCase()} Mobile Money PIN to complete the payment.`,
          // Additional data for frontend
          mobile_money: {
            phone: booking.paymentDetails.momoNumber,
            provider: booking.paymentDetails.momoProvider.toUpperCase(),
            amount: paystackService.convertFromKobo(amountInKobo),
            currency: 'GHS'
          }
        }
      });
    } else {
      res.status(400).json({ error: 'Unsupported payment method' });
      return;
    }

  } catch (error) {
    console.error('Error initializing payment:', error);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
};

// Verify payment (webhook or manual verification)
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reference } = req.params;

    // Find payment by reference
    const payment = await Payment.findOne({ paystackReference: reference });
    if (!payment) {
      res.status(404).json({ error: 'Payment not found' });
      return;
    }

    if (payment.status === 'success') {
      res.json({ message: 'Payment already verified', payment });
      return;
    }

    // Verify with Paystack
    const verification = await paystackService.verifyTransaction(reference);

    if (verification.status && verification.data.status === 'success') {
      // Update payment status
      payment.status = 'success';
      payment.paystackTransactionId = verification.data.id.toString();
      payment.completedAt = new Date();
      await payment.save();

      console.log('✅ Payment verified successfully:', {
        reference: reference,
        amount: verification.data.amount,
        subaccount: verification.data.subaccount,
        platformFee: payment.platformFee,
        ownerAmount: payment.ownerAmount
      });

      // Handle booking creation or update
      let booking = null;

      if (payment.bookingId) {
        // Update existing booking
        booking = await Booking.findById(payment.bookingId);
        if (booking) {
          booking.paymentStatus = 'paid';
          booking.bookingStatus = 'confirmed';
          booking.paystackReference = reference;
          await booking.save();
          console.log('✅ Updated existing booking:', booking._id);

          // Create commission record for admin tracking
          try {
            const Commission = require('../models/Commission').default;
            const User = require('../models/User').default;

            // Find owner and guest users by clerkId
            const ownerUser = await User.findOne({ clerkId: payment.payeeId });
            const guestUser = await User.findOne({ clerkId: payment.payerId });

            if (ownerUser && guestUser) {
              const commissionRate = 0.05; // 5%
              const commissionAmount = payment.amount * commissionRate;

              await Commission.create({
                bookingId: booking._id,
                apartmentId: booking.apartmentId,
                ownerId: ownerUser._id, // Use MongoDB ObjectId
                guestId: guestUser._id, // Use MongoDB ObjectId
                roomPrice: payment.amount,
                commissionRate,
                commissionAmount,
                bookingDate: booking.createdAt,
                checkInDate: booking.checkIn,
                checkOutDate: booking.checkOut,
                paymentReference: reference,
                status: 'paid'
              });
              console.log('✅ Commission record created:', commissionAmount);
            } else {
              console.error('❌ Could not find owner or guest user for commission creation');
            }
          } catch (commissionError) {
            console.error('⚠️ Failed to create commission record:', commissionError);
          }
        }
      } else if (payment.metadata && (payment.metadata as PaymentMetadata).apartmentId) {
        // Create booking from payment metadata (payment-first flow)
        console.log('💳 Creating booking after successful payment...');

        const Apartment = require('../models/Apartment').default;
        const User = require('../models/User').default;
        const metadata = payment.metadata as PaymentMetadata;

        const apartment = await Apartment.findById(metadata.apartmentId);
        const user = await User.findOne({ clerkId: payment.payerId });

        if (apartment && user) {
          // Generate unique ticket code
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substr(2, 6).toUpperCase();
          const ticketCode = `BK${timestamp}${randomStr}`;

          // Create booking with payment information
          const Booking = require('../models/Booking').default;
          booking = new Booking({
            apartmentId: metadata.apartmentId,
            guestId: payment.payerId,
            guestName: user.fullName || `${user.firstName} ${user.lastName}`,
            guestEmail: user.email,
            guestPhone: user.phone || '',
            checkIn: new Date(metadata.checkIn!),
            checkOut: new Date(metadata.checkOut!),
            guests: metadata.guests || 1,
            totalAmount: payment.amount,
            paymentMethod: payment.paymentMethod,
            paymentStatus: 'paid',
            paymentReference: reference,
            bookingStatus: 'confirmed',
            ticketCode,
            specialRequests: ''
          });

          await booking.save();
          console.log('✅ Created booking after payment:', booking._id);

          // Update payment with booking ID
          payment.bookingId = booking._id;
          await payment.save();
        }
      }

      res.json({
        message: 'Payment verified successfully',
        payment,
        transaction: verification.data
      });
    } else {
      // Payment failed
      payment.status = 'failed';
      payment.failureReason = verification.data.gateway_response || 'Payment verification failed';
      await payment.save();

      res.status(400).json({
        error: 'Payment verification failed',
        reason: payment.failureReason
      });
    }

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

// Get payment details
export const getPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id)
      .populate('bookingId', 'ticketCode checkIn checkOut guests')
      .populate('apartmentId', 'title location images');

    if (!payment) {
      res.status(404).json({ error: 'Payment not found' });
      return;
    }

    // Check if user is authorized to view this payment
    if (payment.payerId !== req.user.clerkId && payment.payeeId !== req.user.clerkId && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to view this payment' });
      return;
    }

    res.json({ payment });

  } catch (error) {
    console.error('Error getting payment:', error);
    res.status(500).json({ error: 'Failed to get payment' });
  }
};

// Get user's payments (as payer or payee)
// Verify split payment for booking
export const verifySplitPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reference, bookingId } = req.body;

    if (!reference) {
      res.status(400).json({ error: 'Payment reference is required' });
      return;
    }

    console.log('🔍 Verifying split payment:', { reference, bookingId });

    // Verify payment with Paystack
    const verification = await paystackService.verifyPayment(reference);

    if (!verification.status || verification.data.status !== 'success') {
      res.status(400).json({
        error: 'Payment verification failed',
        details: verification.data.gateway_response
      });
      return;
    }

    const paymentData = verification.data;
    console.log('✅ Payment verified successfully:', {
      reference: paymentData.reference,
      amount: paymentData.amount,
      status: paymentData.status,
      metadata: paymentData.metadata
    });

    // Check if this is an account setup payment
    if (paymentData.metadata?.type === 'account_setup') {
      console.log('🔧 Processing account setup payment');

      const userId = paymentData.metadata.userId;
      const businessName = paymentData.metadata.businessName;
      const description = paymentData.metadata.description || '';

      // Find user and set up their payment account
      const User = require('../models/User').default;
      const user = await User.findOne({ clerkId: userId });

      if (user) {
        // Create Paystack subaccount for the user
        const subaccountData = {
          business_name: businessName,
          settlement_bank: '044', // Default bank code
          account_number: '0000000000', // Placeholder - will be updated when user provides real details
          percentage_charge: 10, // 10% platform commission
          description: description || `Payment account for ${businessName}`,
          primary_contact_email: user.email,
          primary_contact_name: user.fullName || user.firstName,
          primary_contact_phone: user.phoneNumber || '',
          metadata: {
            userId: user.clerkId,
            setupReference: reference
          }
        };

        try {
          const subaccountResponse = await paystackService.createSubaccount(subaccountData);

          // Update user's payment account
          user.paymentAccount = {
            provider: 'paystack',
            accountDetails: {
              subaccountCode: subaccountResponse.data.subaccount_code,
              businessName: businessName,
              description: description
            },
            isVerified: true,
            createdAt: new Date()
          };

          // Update user role to owner if not already
          if (user.role !== 'owner') {
            user.role = 'owner';
          }

          await user.save();

          console.log('✅ Payment account created for user:', userId);
          console.log('✅ Subaccount code:', subaccountResponse.data.subaccount_code);
        } catch (subaccountError) {
          console.error('❌ Error creating subaccount:', subaccountError);
          // Continue with basic account setup even if subaccount creation fails
          user.paymentAccount = {
            provider: 'paystack',
            accountDetails: {
              businessName: businessName,
              description: description
            },
            isVerified: true,
            createdAt: new Date()
          };

          if (user.role !== 'owner') {
            user.role = 'owner';
          }

          await user.save();
        }
      }
    }
    // If bookingId is provided, update the booking status
    else if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (booking) {
        booking.paymentStatus = 'paid';
        booking.bookingStatus = 'confirmed';
        booking.paystackReference = reference;
        await booking.save();

        console.log('✅ Booking updated:', bookingId);

        // Create commission record for admin
        const totalAmountInGHS = paymentData.amount / 100; // Convert from kobo to GHS
        const commissionRate = 0.05; // 5% commission
        const commissionAmount = totalAmountInGHS * commissionRate;

        const Commission = require('../models/Commission').default;
        const User = require('../models/User').default;

        // Find owner and guest users by clerkId
        const ownerUser = await User.findOne({ clerkId: booking.ownerId });
        const guestUser = await User.findOne({ clerkId: booking.guestId });

        if (ownerUser && guestUser) {
          await Commission.create({
            bookingId: booking._id,
            apartmentId: booking.apartmentId,
            ownerId: ownerUser._id, // Use MongoDB ObjectId
            guestId: guestUser._id, // Use MongoDB ObjectId
            roomPrice: totalAmountInGHS,
            commissionRate,
            commissionAmount,
            bookingDate: booking.createdAt,
            checkInDate: booking.checkIn,
            checkOutDate: booking.checkOut,
            paymentReference: reference,
            status: 'paid'
          });
          console.log('✅ Commission created:', commissionAmount);
        } else {
          console.error('❌ Could not find owner or guest user for commission creation');
        }
      }
    }

    res.json({
      message: 'Payment verified successfully',
      payment: {
        reference: paymentData.reference,
        amount: paymentData.amount / 100, // Convert to GHS
        status: paymentData.status,
        paidAt: paymentData.paid_at,
        channel: paymentData.channel,
        currency: paymentData.currency
      }
    });

  } catch (error) {
    console.error('❌ Error verifying split payment:', error);
    res.status(500).json({
      error: 'Payment verification failed',
      details: (error as Error).message
    });
  }
};

export const getUserPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, type = 'all' } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    let filter: any = {};

    if (type === 'sent') {
      filter.payerId = req.user.clerkId;
    } else if (type === 'received') {
      filter.payeeId = req.user.clerkId;
    } else {
      filter = {
        $or: [
          { payerId: req.user.clerkId },
          { payeeId: req.user.clerkId }
        ]
      };
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('bookingId', 'ticketCode checkIn checkOut guests')
        .populate('apartmentId', 'title location images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Payment.countDocuments(filter)
    ]);

    res.json({
      payments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Error getting user payments:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
};
