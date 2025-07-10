const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/apartment-booking');

// Define schemas
const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

const identityVerificationSchema = new mongoose.Schema({}, { strict: false });
const IdentityVerification = mongoose.model('IdentityVerification', identityVerificationSchema);

async function checkUserVerification() {
  try {
    const userId = 'user_2z0oYcxRj5w8i7kOqqH2JJ1smLC';
    console.log('🔍 Checking verification for user:', userId);
    console.log('='.repeat(50));
    
    // Check User model
    const user = await User.findOne({ clerkId: userId });
    console.log('👤 User found:', !!user);
    
    if (user) {
      console.log('📋 User data:');
      console.log('  - ID:', user._id);
      console.log('  - Email:', user.email);
      console.log('  - Name:', user.firstName, user.lastName);
      console.log('  - Identity Verification:', user.identityVerification);
      console.log('  - Payment Account:', user.paymentAccount);
      console.log('  - Created:', user.createdAt);
      console.log('  - Last Login:', user.lastLogin);
    }
    
    console.log('\n' + '='.repeat(50));
    
    // Check IdentityVerification collection
    const verification = await IdentityVerification.findOne({ userId });
    console.log('🔐 IdentityVerification record found:', !!verification);
    
    if (verification) {
      console.log('📋 Verification data:');
      console.log('  - ID:', verification._id);
      console.log('  - Status:', verification.verificationStatus);
      console.log('  - Method:', verification.verificationMethod);
      console.log('  - Verified At:', verification.verifiedAt);
      console.log('  - Created At:', verification.createdAt);
      console.log('  - Personal Info:', verification.personalInfo);
      console.log('  - House Registration:', verification.houseRegistration);
    }
    
    console.log('\n' + '='.repeat(50));
    
    // Check what the verification status endpoint should return
    const isUserVerified = user?.identityVerification?.isVerified || false;
    const isVerificationRecordVerified = verification && verification.verificationStatus === 'verified';
    const isVerified = isUserVerified || isVerificationRecordVerified;
    const hasPaymentAccount = !!user?.paymentAccount;
    const isPaymentVerified = user?.paymentAccount?.isVerified || false;
    
    console.log('🧮 Computed verification status:');
    console.log('  - isUserVerified (from User model):', isUserVerified);
    console.log('  - isVerificationRecordVerified (from IdentityVerification):', isVerificationRecordVerified);
    console.log('  - Final isVerified:', isVerified);
    console.log('  - hasPaymentAccount:', hasPaymentAccount);
    console.log('  - isPaymentVerified:', isPaymentVerified);
    console.log('  - canListApartments:', isVerified && hasPaymentAccount && isPaymentVerified);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Database check completed');
    
  } catch (error) {
    console.error('❌ Error checking user verification:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

checkUserVerification();
