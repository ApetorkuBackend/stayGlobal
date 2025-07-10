import { Request, Response } from 'express';
import Payment from '../models/Payment';
import Booking from '../models/Booking';
import Apartment from '../models/Apartment';
import User from '../models/User';
import paystackService from '../services/paystackService';
import { syncUserWithClerk } from '../utils/userUtils';

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

    // Calculate fees
    const totalAmount = booking.totalAmount;
    const platformFee = paystackService.calculatePlatformFee(totalAmount);
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
          checkOut: booking.checkOut
        },
        subaccount: owner.paymentAccount.accountDetails.subaccountCode,
        transaction_charge: paystackService.convertToKobo(platformFee),
        bearer: 'subaccount' as const
      };

      const paystackResponse = await paystackService.initializeTransaction(paystackData);

      if (!paystackResponse.status) {
        res.status(400).json({ error: 'Failed to initialize payment' });
        return;
      }

      // Update payment with Paystack details
      payment.paystackReference = reference;
      payment.paystackSubaccountCode = owner.paymentAccount.accountDetails.subaccountCode;
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
          subaccount: owner.paymentAccount.accountDetails.subaccountCode,
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
          mobile_money_provider: booking.paymentDetails.momoProvider.toUpperCase()
        },
        subaccount: owner.paymentAccount.accountDetails.subaccountCode,
        transaction_charge: paystackService.convertToKobo(platformFee),
        bearer: 'subaccount' as const
      };

      // Use mobile money charge API to send USSD prompt to user's phone
      const momoResponse = await paystackService.chargeMobileMoney(momoChargeData);

      if (!momoResponse.status) {
        res.status(400).json({ error: 'Failed to initiate mobile money payment' });
        return;
      }

      // Update payment with Paystack details
      payment.paystackReference = reference;
      payment.paystackSubaccountCode = owner.paymentAccount.accountDetails.subaccountCode;
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

      // Update booking payment status
      const booking = await Booking.findById(payment.bookingId);
      if (booking) {
        booking.paymentStatus = 'paid';
        await booking.save();
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
