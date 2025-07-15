import express from 'express';
import { requireAuth } from '../middleware/auth';
import { syncUserWithClerk, createUserFromClerk } from '../utils/userUtils';
import User, { IUser } from '../models/User';

const router = express.Router();

// Get current user basic info (for role-based routing)
router.get('/me', requireAuth, async (req, res): Promise<void> => {
  try {
    const reqUser = (req as any).user;
    res.json({
      role: reqUser.role,
      email: reqUser.email,
      firstName: reqUser.firstName,
      lastName: reqUser.lastName,
      clerkId: reqUser.clerkId
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// Update user role (for role selection during sign-up)
router.patch('/update-role', requireAuth, async (req, res): Promise<void> => {
  try {
    const { role } = req.body;
    const reqUser = (req as any).user;

    // Validate role
    if (!role || !['guest', 'owner', 'admin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be guest, owner, or admin' });
      return;
    }

    // Update user role in database
    const updatedUser = await User.findOneAndUpdate(
      { clerkId: reqUser.clerkId },
      { role },
      { new: true }
    );

    if (!updatedUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    console.log(`✅ User role updated: ${reqUser.email} -> ${role}`);
    res.json({
      message: 'Role updated successfully',
      role: updatedUser.role
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Get current user profile
router.get('/profile', requireAuth, async (req, res): Promise<void> => {
  try {
    const reqUser = (req as any).user;
    res.json(reqUser);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.patch('/profile', requireAuth, async (req, res): Promise<void> => {
  try {
    const { phone, preferences } = req.body;

    // Get the MongoDB user document, not the Clerk user
    const reqUser = (req as any).user;
    const user = await User.findOne({ clerkId: reqUser.clerkId }) as IUser;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Update fields if provided
    if (phone) {
      user.phone = phone;
    }
    if (preferences) {
      user.preferences = { ...user.preferences, ...preferences };
    }

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Test authentication endpoint
router.get('/test-auth', requireAuth, async (req, res): Promise<void> => {
  try {
    const reqUser = (req as any).user;
    res.json({
      message: 'Authentication successful',
      user: {
        id: reqUser.clerkId,
        email: reqUser.email,
        role: reqUser.role
      }
    });
  } catch (error) {
    console.error('Test auth error:', error);
    res.status(500).json({ error: 'Test auth failed' });
  }
});

// Sync user with Clerk (useful for first-time login)
router.post('/sync', async (req, res): Promise<void> => {
  console.log('🔄 User sync endpoint hit');
  console.log('Request body:', req.body);
  console.log('Request headers:', req.headers);

  try {
    const { clerkUserId } = req.body;

    if (!clerkUserId) {
      console.log('❌ No clerkUserId provided');
      res.status(400).json({ error: 'Clerk user ID is required' });
      return;
    }

    console.log('🔍 Syncing user with Clerk ID:', clerkUserId);
    const user = await syncUserWithClerk(clerkUserId);
    console.log('✅ User synced successfully:', user._id);

    res.json({
      message: 'User synced successfully',
      user
    });
  } catch (error) {
    console.error('❌ Error syncing user:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// Create user from Clerk webhook (for new user registration)
router.post('/webhook/create', async (req, res): Promise<void> => {
  try {
    const { data } = req.body;

    if (!data || !data.id) {
      res.status(400).json({ error: 'Invalid webhook data' });
      return;
    }

    const user = await createUserFromClerk(data.id);

    res.json({
      message: 'User created successfully',
      user
    });
  } catch (error) {
    console.error('Error creating user from webhook:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

export default router;
