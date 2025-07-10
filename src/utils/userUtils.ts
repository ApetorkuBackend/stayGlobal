import { clerkClient } from '@clerk/express';
import User, { IUser } from '../models/User';

export const createUserFromClerk = async (clerkUserId: string): Promise<IUser> => {
  try {
    // Get user data from Clerk
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    
    // Extract user information
    const email = clerkUser.emailAddresses.find(email => email.id === clerkUser.primaryEmailAddressId)?.emailAddress;
    const firstName = clerkUser.firstName || '';
    const lastName = clerkUser.lastName || '';
    const avatar = clerkUser.imageUrl;
    
    if (!email) {
      throw new Error('User email not found in Clerk');
    }

    // Create user in our database
    const user = new User({
      clerkId: clerkUserId,
      email,
      firstName,
      lastName,
      avatar,
      role: 'owner', // Default role - allow users to list apartments
      isActive: true
    });

    await user.save();
    return user;
  } catch (error) {
    console.error('Error creating user from Clerk:', error);
    throw error;
  }
};

export const syncUserWithClerk = async (clerkUserId: string): Promise<IUser> => {
  try {
    console.log('🔍 Looking for user in database with Clerk ID:', clerkUserId);

    // Check if user exists in our database
    // eslint-disable-next-line prefer-const
    let user = await User.findOne({ clerkId: clerkUserId });

    if (!user) {
      console.log('👤 User not found in database, creating new user');
      // Create new user if doesn't exist
      const newUser = await createUserFromClerk(clerkUserId);
      console.log('✅ New user created:', newUser._id);
      return newUser as IUser;
    } else {
      console.log('👤 User found in database, updating with latest Clerk data');
      // Update existing user with latest Clerk data
      console.log('🔄 Fetching user data from Clerk...');
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      console.log('📧 Clerk user email addresses:', clerkUser.emailAddresses.length);

      const email = clerkUser.emailAddresses.find(email => email.id === clerkUser.primaryEmailAddressId)?.emailAddress;

      if (email) {
        console.log('📧 Updating user with email:', email);
        user.email = email;
        user.firstName = clerkUser.firstName || user.firstName;
        user.lastName = clerkUser.lastName || user.lastName;
        user.avatar = clerkUser.imageUrl || user.avatar;

        // Update role to owner if still guest (for existing users)
        if (user.role === 'guest') {
          console.log('🔄 Upgrading user role from guest to owner');
          user.role = 'owner';
        }

        await user.save();
        console.log('✅ User updated successfully');
      } else {
        console.log('⚠️ No email found for user');
      }
      return user as IUser;
    }
  } catch (error) {
    console.error('❌ Error syncing user with Clerk:', error);
    throw error;
  }
};

export const getUserByClerkId = async (clerkUserId: string): Promise<IUser | null> => {
  try {
    const user = await User.findOne({ clerkId: clerkUserId });
    return user as IUser | null;
  } catch (error) {
    console.error('Error getting user by Clerk ID:', error);
    throw error;
  }
};
