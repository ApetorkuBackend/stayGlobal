import express, { Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import User from '../models/User';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Get list of banks for Ghana
router.get('/banks', async (req, res) => {
  try {
    console.log('🏦 Fetching banks from Paystack...');
    
    const response = await fetch('https://api.paystack.co/bank?currency=GHS', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Paystack API error: ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.status) {
      throw new Error(data.message || 'Failed to fetch banks');
    }

    // Return simplified bank list with name and code
    const banks = data.data.map((bank: any) => ({
      name: bank.name,
      code: bank.code
    }));

    console.log(`🏦 Retrieved ${banks.length} banks from Paystack`);
    
    res.json({
      status: true,
      message: 'Banks retrieved successfully',
      data: banks
    });

  } catch (error) {
    console.error('❌ Error fetching banks:', error);
    res.status(500).json({
      status: false,
      error: 'Failed to fetch banks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Validate/resolve account number
router.post('/resolve-account', async (req: Request, res: Response): Promise<void> => {
  try {
    const { bankCode, accountNumber } = req.body;

    if (!bankCode || !accountNumber) {
      res.status(400).json({
        status: false,
        error: 'Bank code and account number are required'
      });
      return;
    }

    console.log('🔍 Resolving account:', { bankCode, accountNumber });

    const response = await fetch('https://api.paystack.co/bank/resolve', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      // Add query parameters
    });

    // Construct URL with query parameters
    const url = new URL('https://api.paystack.co/bank/resolve');
    url.searchParams.append('account_number', accountNumber);
    url.searchParams.append('bank_code', bankCode);

    const resolveResponse = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!resolveResponse.ok) {
      throw new Error(`Paystack API error: ${resolveResponse.status}`);
    }

    const resolveData = await resolveResponse.json() as any;

    if (!resolveData.status) {
      throw new Error(resolveData.message || 'Failed to resolve account');
    }

    console.log('✅ Account resolved:', resolveData.data.account_name);

    res.json({
      status: true,
      message: 'Account resolved successfully',
      data: {
        accountName: resolveData.data.account_name,
        accountNumber: resolveData.data.account_number,
        bankCode: bankCode
      }
    });

  } catch (error) {
    console.error('❌ Error resolving account:', error);
    res.status(500).json({
      status: false,
      error: 'Failed to resolve account',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Redirect to the correct endpoint for subaccount creation
router.post('/create-subaccount', requireRole(['owner']), async (req: Request, res: Response): Promise<void> => {
  res.status(301).json({
    status: false,
    error: 'This endpoint has been moved',
    message: 'Please use /api/user-payments/account/paystack for payment account setup',
    redirectTo: '/api/user-payments/account/paystack'
  });
});

// DEPRECATED: Old subaccount creation logic - kept for reference
router.post('/create-subaccount-deprecated', requireRole(['owner']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { businessName, bankCode, accountNumber } = req.body;
    const userId = (req as any).user.clerkId;

    if (!businessName || !bankCode || !accountNumber) {
      res.status(400).json({
        status: false,
        error: 'Business name, bank code, and account number are required'
      });
      return;
    }

    console.log('🏗️ Creating subaccount for user:', userId);

    // Find the user
    const user = await User.findOne({ clerkId: userId });
    if (!user) {
      res.status(404).json({
        status: false,
        error: 'User not found'
      });
      return;
    }

    // Check if user already has a subaccount
    if (user.paymentAccount?.accountDetails?.subaccountCode) {
      res.status(400).json({
        status: false,
        error: 'User already has a subaccount configured'
      });
      return;
    }

    // Create subaccount with Paystack
    const subaccountData = {
      business_name: businessName,
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: 10 // Platform takes 10%
    };

    console.log('📤 Sending subaccount data to Paystack:', subaccountData);

    const response = await fetch('https://api.paystack.co/subaccount', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subaccountData)
    });

    if (!response.ok) {
      const errorData = await response.json() as any;
      throw new Error(errorData.message || `Paystack API error: ${response.status}`);
    }

    const paystackResult = await response.json() as any;

    if (!paystackResult.status) {
      throw new Error(paystackResult.message || 'Failed to create subaccount');
    }

    const subaccountCode = paystackResult.data.subaccount_code;
    console.log('✅ Subaccount created:', subaccountCode);

    // Update user's payment account with subaccount code
    if (!user.paymentAccount) {
      user.paymentAccount = {
        provider: 'paystack',
        isVerified: true,
        accountDetails: {},
        createdAt: new Date()
      };
    }

    user.paymentAccount.provider = 'paystack';
    user.paymentAccount.isVerified = true;
    user.paymentAccount.accountDetails = {
      ...user.paymentAccount.accountDetails,
      subaccountCode: subaccountCode,
      bankCode: bankCode,
      accountNumber: accountNumber
    };

    await user.save();

    console.log('✅ User payment account updated with subaccount');

    res.json({
      status: true,
      message: 'Subaccount created successfully',
      data: {
        subaccountCode: subaccountCode,
        businessName: businessName,
        bankCode: bankCode,
        accountNumber: accountNumber
      }
    });

  } catch (error) {
    console.error('❌ Error creating subaccount:', error);
    res.status(500).json({
      status: false,
      error: 'Failed to create subaccount',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
