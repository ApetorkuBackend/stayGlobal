import { Request, Response } from 'express';
import User from '../models/User';
import paystackService from '../services/paystackService';
import { syncUserWithClerk } from '../utils/userUtils';

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

    // Only owners can set up payment accounts
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Only property owners can set up payment accounts' });
      return;
    }

    // Verify account number with bank
    try {
      const accountVerification = await paystackService.resolveAccountNumber(accountNumber, bankCode);
      
      if (!accountVerification.status) {
        res.status(400).json({ error: 'Invalid account number or bank code' });
        return;
      }

      const accountName = accountVerification.data.account_name;

      // Create Paystack subaccount
      const subaccountData = {
        business_name: businessName,
        settlement_bank: bankCode,
        account_number: accountNumber,
        percentage_charge: 5, // 5% platform fee
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

      // Update user with payment account details
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
          }
        },
        { new: true }
      );

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

    // Only owners can set up payment accounts
    if (user.role !== 'owner') {
      res.status(403).json({ error: 'Only property owners can set up payment accounts' });
      return;
    }

    // Update user with mobile money account details
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
        }
      },
      { new: true }
    );

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
    const banksResponse = await paystackService.listBanks();
    
    if (!banksResponse.status) {
      res.status(500).json({ error: 'Failed to fetch banks' });
      return;
    }

    // Filter to show only major Ghanaian banks
    const ghanaianBanks = banksResponse.data.filter((bank: any) => 
      bank.country === 'Ghana' || bank.currency === 'GHS'
    );

    res.json({
      banks: ghanaianBanks
    });

  } catch (error) {
    console.error('Error getting banks:', error);
    res.status(500).json({ error: 'Failed to get banks list' });
  }
};

// Verify account number
export const verifyAccountNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode) {
      res.status(400).json({ error: 'Account number and bank code are required' });
      return;
    }

    const verification = await paystackService.resolveAccountNumber(accountNumber, bankCode);

    if (!verification.status) {
      res.status(400).json({ error: 'Invalid account number or bank code' });
      return;
    }

    res.json({
      accountName: verification.data.account_name,
      accountNumber: verification.data.account_number,
      bankCode: bankCode
    });

  } catch (error) {
    console.error('Error verifying account:', error);
    res.status(400).json({ error: 'Failed to verify account number' });
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
