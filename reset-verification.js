// Simple script to reset verification for testing
// Run this from the backend directory with: node reset-verification.js

const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://localhost:27017/apartment-booking';
const USER_ID = 'user_2z0oYcxRj5w8i7kOqqH2JJ1smLC'; // Current test user

async function resetVerification() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔄 Connecting to MongoDB...');
    await client.connect();
    
    const db = client.db();
    const collection = db.collection('identityverifications');
    
    console.log(`👤 Resetting verification for user: ${USER_ID}`);
    
    // Delete existing verification
    const result = await collection.deleteMany({ userId: USER_ID });
    
    console.log(`✅ Deleted ${result.deletedCount} verification(s)`);
    
    if (result.deletedCount > 0) {
      console.log('🎉 Verification reset successfully! You can now test the verification form again.');
    } else {
      console.log('ℹ️ No verification found for this user.');
    }
    
  } catch (error) {
    console.error('❌ Error resetting verification:', error);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

resetVerification();
