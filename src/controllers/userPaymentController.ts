import { Request, Response } from 'express';
import User from '../models/User';
import Apartment from '../models/Apartment';
import paystackService from '../services/paystackService';
import { syncUserWithClerk } from '../utils/userUtils';
import crypto from 'crypto';

// Initialize account setup with inline payment
export const initializeAccountSetup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { businessName, description } = req.body;

    // Validate required fields
    if (!businessName) {
      res.status(400).json({
        error: 'Business name is required'
      });
      return;
    }

    // Get user info
    const user = await syncUserWithClerk(req.user.clerkId);

    // Check if user already has a payment account
    if (user.paymentAccount?.isVerified) {
      res.status(400).json({
        error: 'Payment account already exists',
        message: 'You already have a verified payment account.'
      });
      return;
    }

    // Generate unique reference for the setup payment
    const reference = `setup_${user.clerkId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    console.log('🔧 Initializing account setup for user:', user.clerkId);
    console.log('🔧 Business name:', businessName);
    console.log('🔧 Reference:', reference);

    res.json({
      reference,
      amount: 1, // 1 GHS setup fee
      currency: 'GHS',
      email: user.email,
      metadata: {
        type: 'account_setup',
        userId: user.clerkId,
        businessName,
        description: description || ''
      }
    });

  } catch (error) {
    console.error('❌ Error initializing account setup:', error);
    res.status(500).json({
      error: 'Failed to initialize account setup',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Set up Paystack payment account for owner
export const setupPaystackAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bankCode, accountNumber, businessName, description } = req.body;

    // Validate required fields
    if (!bankCode || !accountNumber || !businessName) {
      res.status(400).json({ 
        error: 'Bank code, account number, and business name are required' 
      });
      return;
    }

    // Get user info
    const user = await syncUserWithClerk(req.user.clerkId);

    // Check if user already has a payment account
    if (user.paymentAccount?.isVerified) {
      res.status(400).json({
        error: 'Payment account already exists',
        message: 'You already have a verified payment account. Remove the existing account first if you want to set up a new one.'
      });
      return;
    }

    // Allow any authenticated user to set up payment accounts (they become owners after setup)

    // Verify account number with bank
    try {
      const accountVerification = await paystackService.resolveAccountNumber(accountNumber, bankCode);
      
      if (!accountVerification.status) {
        res.status(400).json({ error: 'Invalid account number or bank code' });
        return;
      }

      const accountName = accountVerification.data.account_name;

      // Create Paystack subaccount (10% to platform, 90% to owner)
      // Note: percentage_charge is what the PLATFORM takes, not what the owner gets
      const subaccountData = {
        business_name: businessName,
        settlement_bank: bankCode,
        account_number: accountNumber,
        percentage_charge: 10, // Platform takes 10%, owner gets 90%
        description: description || `Subaccount for ${businessName}`,
        primary_contact_email: user.email,
        primary_contact_name: user.fullName || user.email,
        primary_contact_phone: user.phone || '',
        metadata: {
          userId: user.clerkId,
          userEmail: user.email
        }
      };

      const subaccountResponse = await paystackService.createSubaccount(subaccountData);

      if (!subaccountResponse.status) {
        res.status(400).json({ error: 'Failed to create payment account' });
        return;
      }

      // Update user with payment account details and set role to owner
      const updatedUser = await User.findOneAndUpdate(
        { clerkId: user.clerkId },
        {
          paymentAccount: {
            provider: 'paystack',
            accountDetails: {
              subaccountCode: subaccountResponse.data.subaccount_code,
              bankCode,
              accountNumber,
              accountName
            },
            isVerified: true,
            createdAt: new Date()
          },
          role: 'owner' // Automatically set role to owner after payment setup
        },
        { new: true }
      );

      // Update all existing apartments owned by this user with the new payment account details
      try {
        const ownerPaymentAccount = {
          provider: 'paystack',
          subaccountCode: subaccountResponse.data.subaccount_code,
          accountNumber,
          bankCode,
          accountName
        };

        const updateResult = await Apartment.updateMany(
          { ownerId: user.clerkId },
          { $set: { ownerPaymentAccount } }
        );

        console.log(`✅ Updated ${updateResult.modifiedCount} apartments with new payment account details`);
      } catch (apartmentUpdateError) {
        console.error('⚠️ Failed to update existing apartments with payment account:', apartmentUpdateError);
        // Don't fail the payment setup if apartment update fails
      }

      res.json({
        message: 'Payment account set up successfully',
        paymentAccount: updatedUser?.paymentAccount
      });

    } catch (verificationError: any) {
      console.error('Account verification error:', verificationError);
      res.status(400).json({ 
        error: 'Failed to verify account details. Please check your account number and bank code.' 
      });
      return;
    }

  } catch (error) {
    console.error('Error setting up Paystack account:', error);
    res.status(500).json({ error: 'Failed to set up payment account' });
  }
};

// Set up Mobile Money payment account
export const setupMomoAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { momoNumber, momoProvider } = req.body;

    // Validate required fields
    if (!momoNumber || !momoProvider) {
      res.status(400).json({ 
        error: 'Mobile money number and provider are required' 
      });
      return;
    }

    // Validate provider
    const validProviders = ['mtn', 'vodafone', 'airteltigo'];
    if (!validProviders.includes(momoProvider)) {
      res.status(400).json({ 
        error: 'Invalid mobile money provider. Must be one of: mtn, vodafone, airteltigo' 
      });
      return;
    }

    // Get user info
    const user = await syncUserWithClerk(req.user.clerkId);

    // Check if user already has a payment account
    if (user.paymentAccount?.isVerified) {
      res.status(400).json({
        error: 'Payment account already exists',
        message: 'You already have a verified payment account. Remove the existing account first if you want to set up a new one.'
      });
      return;
    }

    // Update user with mobile money account details and set role to owner
    const updatedUser = await User.findOneAndUpdate(
      { clerkId: user.clerkId },
      {
        paymentAccount: {
          provider: 'momo',
          accountDetails: {
            momoNumber,
            momoProvider
          },
          isVerified: true, // For now, we'll mark as verified immediately
          createdAt: new Date()
        },
        role: 'owner' // Automatically set role to owner after payment setup
      },
      { new: true }
    );

    // Update all existing apartments owned by this user with the new payment account details
    try {
      const ownerPaymentAccount = {
        provider: 'momo',
        momoNumber,
        momoProvider
      };

      const updateResult = await Apartment.updateMany(
        { ownerId: user.clerkId },
        { $set: { ownerPaymentAccount } }
      );

      console.log(`✅ Updated ${updateResult.modifiedCount} apartments with new Mobile Money account details`);
    } catch (apartmentUpdateError) {
      console.error('⚠️ Failed to update existing apartments with Mobile Money account:', apartmentUpdateError);
      // Don't fail the payment setup if apartment update fails
    }

    res.json({
      message: 'Mobile Money account set up successfully',
      paymentAccount: updatedUser?.paymentAccount
    });

  } catch (error) {
    console.error('Error setting up Mobile Money account:', error);
    res.status(500).json({ error: 'Failed to set up Mobile Money account' });
  }
};

// Get user's payment account
export const getPaymentAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findOne({ clerkId: req.user.clerkId }).select('paymentAccount');
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      paymentAccount: user.paymentAccount || null
    });

  } catch (error) {
    console.error('Error getting payment account:', error);
    res.status(500).json({ error: 'Failed to get payment account' });
  }
};

// Get list of supported banks
export const getBanks = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🏦 getBanks function called!');
    console.log('🏦 Fetching banks...');

    // Always use real Paystack API for accurate bank codes
    try {
      console.log('🔑 Using Paystack API for banks...');
      const banksResponse = await paystackService.listBanks();

        if (banksResponse.status && banksResponse.data) {
          console.log(`🏦 Total banks from Paystack: ${banksResponse.data.length}`);

          // Log first few banks to see the structure
          if (banksResponse.data.length > 0) {
            console.log('🔍 Sample bank structure:', JSON.stringify(banksResponse.data[0], null, 2));
            console.log('🔍 First 10 bank names:', banksResponse.data.slice(0, 10).map(b => `${b.name} (${b.code})`));
          }

          // Debug: Check for actual Ghana banks by country
          const actualGhanaBanks = banksResponse.data.filter((bank: any) =>
            bank.country && bank.country.toLowerCase() === 'ghana'
          );
          console.log('🇬🇭 ACTUAL GHANA BANKS (by country):', actualGhanaBanks.map(b => ({
            name: b.name,
            code: b.code,
            country: b.country,
            currency: b.currency,
            active: b.active
          })));

          // Debug: Check banks with "Ghana" in the name
          const ghanaNameBanks = banksResponse.data.filter((bank: any) =>
            bank.name && bank.name.toLowerCase().includes('ghana')
          );
          console.log('🔍 BANKS WITH "GHANA" IN NAME:', ghanaNameBanks.map(b => ({
            name: b.name,
            code: b.code,
            country: b.country,
            currency: b.currency
          })));

          // Look for banks with Ghana in the name or common Ghanaian banks
          const ghanaianBanks = banksResponse.data.filter((bank: any) => {
            const bankName = bank.name ? bank.name.toLowerCase() : '';
            return bankName.includes('ghana') ||
                   bankName.includes('gcb') ||
                   bankName.includes('access') ||
                   bankName.includes('ecobank') ||
                   bankName.includes('fidelity') ||
                   bankName.includes('zenith') ||
                   bankName.includes('standard chartered') ||
                   bankName.includes('guaranty trust') ||
                   bankName.includes('uba') ||
                   bankName.includes('agricultural development');
          });

          console.log(`✅ Retrieved ${ghanaianBanks.length} Ghanaian banks from Paystack`);
          if (ghanaianBanks.length > 0) {
            console.log('🏦 Found Ghana banks:', ghanaianBanks.slice(0, 10).map(b => `${b.name} (${b.code})`));
            res.json({ banks: ghanaianBanks });
            return;
          } else {
            console.log('⚠️ No Ghanaian banks found in Paystack response');
            // Log some bank names to see what's available
            console.log('🔍 Available bank names (first 20):',
              banksResponse.data.slice(0, 20).map(b => `${b.name} (${b.code})`)
            );
          }
        }
    } catch (paystackError) {
      console.log('⚠️ Paystack API failed, using fallback banks:', paystackError);
    }

    // Use fallback banks if Paystack API fails
    console.log('🏦 Using fallback banks for reliability...');

    // Fallback banks (major Ghanaian banks with correct Paystack codes)
    // These are the actual bank codes that work with Paystack Ghana
    const fallbackBanks = [
      { name: 'Access Bank Ghana', code: '044', country: 'Ghana', currency: 'GHS' },
      { name: 'Agricultural Development Bank', code: '046', country: 'Ghana', currency: 'GHS' },
      { name: 'Bank of Africa Ghana', code: '045', country: 'Ghana', currency: 'GHS' },
      { name: 'Consolidated Bank Ghana', code: '041', country: 'Ghana', currency: 'GHS' },
      { name: 'Ecobank Ghana', code: '130', country: 'Ghana', currency: 'GHS' },
      { name: 'Fidelity Bank Ghana', code: '240', country: 'Ghana', currency: 'GHS' },
      { name: 'First National Bank Ghana', code: '330', country: 'Ghana', currency: 'GHS' },
      { name: 'GCB Bank Limited', code: '040', country: 'Ghana', currency: 'GHS' },
      { name: 'Guaranty Trust Bank Ghana', code: '050', country: 'Ghana', currency: 'GHS' },
      { name: 'National Investment Bank', code: '060', country: 'Ghana', currency: 'GHS' },
      { name: 'Republic Bank Ghana', code: '270', country: 'Ghana', currency: 'GHS' },
      { name: 'Societe Generale Ghana', code: '090', country: 'Ghana', currency: 'GHS' },
      { name: 'Standard Chartered Bank Ghana', code: '020', country: 'Ghana', currency: 'GHS' },
      { name: 'United Bank for Africa Ghana', code: '300', country: 'Ghana', currency: 'GHS' },
      { name: 'Universal Merchant Bank', code: '120', country: 'Ghana', currency: 'GHS' },
      { name: 'Zenith Bank Ghana', code: '057', country: 'Ghana', currency: 'GHS' }
    ];

    console.log(`🏦 Using fallback banks: ${fallbackBanks.length} banks`);
    res.json({ banks: fallbackBanks });

  } catch (error) {
    console.error('❌ Error getting banks:', error);
    res.status(500).json({
      error: 'Failed to get banks list',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Verify account number
export const verifyAccountNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const { accountNumber, bankCode } = req.body;

    console.log('🔍 Verifying account:', { accountNumber, bankCode });

    if (!accountNumber || !bankCode) {
      res.status(400).json({ error: 'Account number and bank code are required' });
      return;
    }

    // Check if Paystack is configured
    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.error('❌ PAYSTACK_SECRET_KEY not configured for account verification');
      res.status(500).json({
        error: 'Payment service not configured. Please contact support.'
      });
      return;
    }

    try {
      const verification = await paystackService.resolveAccountNumber(accountNumber, bankCode);

      if (!verification.status) {
        console.log('❌ Account verification failed:', verification);
        res.status(400).json({
          error: 'Invalid account number or bank code. Please check your details.'
        });
        return;
      }

      console.log('✅ Account verified:', verification.data.account_name);

      res.json({
        accountName: verification.data.account_name,
        accountNumber: verification.data.account_number,
        bankCode: bankCode
      });

    } catch (paystackError: any) {
      console.error('❌ Paystack verification error:', paystackError);
      res.status(400).json({
        error: 'Unable to verify account. Please check your account number and bank selection.',
        details: paystackError.message
      });
    }

  } catch (error) {
    console.error('❌ Error verifying account:', error);
    res.status(500).json({
      error: 'Failed to verify account number',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Remove payment account
export const removePaymentAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findOneAndUpdate(
      { clerkId: req.user.clerkId },
      { $unset: { paymentAccount: 1 } },
      { new: true }
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      message: 'Payment account removed successfully'
    });

  } catch (error) {
    console.error('Error removing payment account:', error);
    res.status(500).json({ error: 'Failed to remove payment account' });
  }
};
