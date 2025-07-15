import mongoose from 'mongoose';
import Apartment from '../models/Apartment';
import User from '../models/User';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const updateApartmentPaymentAccounts = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('✅ Connected to MongoDB');

    console.log('🔍 Finding apartments without payment account data...');
    
    // Find all apartments that don't have ownerPaymentAccount or have incomplete data
    const apartments = await Apartment.find({
      $or: [
        { ownerPaymentAccount: { $exists: false } },
        { 'ownerPaymentAccount.provider': { $exists: false } },
        { 'ownerPaymentAccount.subaccountCode': { $exists: false } }
      ]
    });

    console.log(`📊 Found ${apartments.length} apartments to update`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const apartment of apartments) {
      console.log(`\n🏠 Processing apartment: ${apartment.title} (Owner: ${apartment.ownerId})`);

      // Find the owner's user record
      const owner = await User.findOne({ clerkId: apartment.ownerId });

      if (!owner) {
        console.log(`❌ Owner not found for apartment ${apartment.title}`);
        skippedCount++;
        continue;
      }

      if (!owner.paymentAccount?.isVerified) {
        console.log(`⚠️ Owner ${owner.email} doesn't have verified payment account`);
        skippedCount++;
        continue;
      }

      // Update apartment with owner's payment account data
      const ownerPaymentAccount = {
        provider: owner.paymentAccount.provider,
        subaccountCode: owner.paymentAccount.accountDetails?.subaccountCode,
        accountNumber: owner.paymentAccount.accountDetails?.accountNumber,
        bankCode: owner.paymentAccount.accountDetails?.bankCode,
        momoNumber: owner.paymentAccount.accountDetails?.momoNumber,
        momoProvider: owner.paymentAccount.accountDetails?.momoProvider
      };

      await Apartment.findByIdAndUpdate(
        apartment._id,
        { ownerPaymentAccount },
        { new: true }
      );

      console.log(`✅ Updated apartment ${apartment.title} with payment account data`);
      console.log(`   Provider: ${ownerPaymentAccount.provider}`);
      console.log(`   Subaccount: ${ownerPaymentAccount.subaccountCode || 'N/A'}`);
      
      updatedCount++;
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Updated: ${updatedCount} apartments`);
    console.log(`   ⚠️ Skipped: ${skippedCount} apartments`);
    console.log(`   📝 Total processed: ${apartments.length} apartments`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the migration
if (require.main === module) {
  updateApartmentPaymentAccounts()
    .then(() => {
      console.log('🎉 Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export default updateApartmentPaymentAccounts;
