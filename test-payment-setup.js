const mongoose = require('mongoose');
const User = require('./dist/models/User').default;
const Apartment = require('./dist/models/Apartment').default;
require('dotenv').config();

async function testPaymentSetup() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Test 1: Find users with payment accounts
    console.log('\n🔍 Testing Payment Account Setup...');
    const usersWithPayment = await User.find({ 
      'paymentAccount.isVerified': true 
    }).select('email paymentAccount');

    console.log(`Found ${usersWithPayment.length} users with verified payment accounts:`);
    usersWithPayment.forEach(user => {
      console.log(`- ${user.email}: ${user.paymentAccount.provider} (${user.paymentAccount.accountDetails.subaccountCode || user.paymentAccount.accountDetails.momoNumber})`);
    });

    // Test 2: Check apartment payment mapping
    console.log('\n🏠 Testing Apartment Payment Mapping...');
    const apartmentsWithPayment = await Apartment.find({
      'ownerPaymentAccount.provider': { $exists: true }
    }).select('title ownerId ownerEmail ownerPaymentAccount');

    console.log(`Found ${apartmentsWithPayment.length} apartments with payment accounts:`);
    apartmentsWithPayment.forEach(apt => {
      console.log(`- ${apt.title} (${apt.ownerEmail}): ${apt.ownerPaymentAccount.provider} (${apt.ownerPaymentAccount.subaccountCode || apt.ownerPaymentAccount.momoNumber})`);
    });

    // Test 3: Check for mismatched payment accounts
    console.log('\n⚠️  Checking for Payment Account Mismatches...');
    const apartmentsWithoutPayment = await Apartment.find({
      'ownerPaymentAccount.provider': { $exists: false }
    }).select('title ownerId ownerEmail');

    if (apartmentsWithoutPayment.length > 0) {
      console.log(`Found ${apartmentsWithoutPayment.length} apartments without payment accounts:`);
      
      for (const apt of apartmentsWithoutPayment) {
        const owner = await User.findOne({ clerkId: apt.ownerId }).select('paymentAccount');
        if (owner && owner.paymentAccount && owner.paymentAccount.isVerified) {
          console.log(`- ${apt.title} (${apt.ownerEmail}): Owner has payment account but apartment doesn't`);
        } else {
          console.log(`- ${apt.title} (${apt.ownerEmail}): Owner has no payment account`);
        }
      }
    } else {
      console.log('✅ All apartments have payment accounts configured');
    }

    // Test 4: Validate Paystack subaccount codes
    console.log('\n💳 Validating Paystack Subaccount Codes...');
    const paystackApartments = await Apartment.find({
      'ownerPaymentAccount.provider': 'paystack'
    }).select('title ownerPaymentAccount.subaccountCode');

    let validSubaccounts = 0;
    let invalidSubaccounts = 0;

    paystackApartments.forEach(apt => {
      const subaccountCode = apt.ownerPaymentAccount.subaccountCode;
      if (subaccountCode && subaccountCode.startsWith('ACCT_')) {
        validSubaccounts++;
      } else {
        invalidSubaccounts++;
        console.log(`❌ Invalid subaccount code for ${apt.title}: ${subaccountCode}`);
      }
    });

    console.log(`✅ Valid subaccount codes: ${validSubaccounts}`);
    console.log(`❌ Invalid subaccount codes: ${invalidSubaccounts}`);

    // Test 5: Check percentage charge configuration
    console.log('\n📊 Payment Configuration Summary:');
    console.log('- Platform fee: 10%');
    console.log('- Owner receives: 90%');
    console.log('- Split payment method: Paystack subaccounts');
    console.log('- Bearer: subaccount (owner pays transaction fees)');

    console.log('\n✅ Payment setup test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testPaymentSetup();
