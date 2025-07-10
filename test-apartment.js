const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = 'mongodb+srv://efyasexy6:5AHg36GcTTuTCkQl@cluster0.2xfvngo.mongodb.net/apartment-booking';

async function testApartment() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Test apartment ID from the error
    const apartmentId = '686d6c7fe66e2aa6392d2c6d';
    console.log('🏠 Testing apartment ID:', apartmentId);

    // Check if it's a valid ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(apartmentId);
    console.log('🔍 Is valid ObjectId:', isValidObjectId);

    if (isValidObjectId) {
      // Try to find the apartment
      const Apartment = mongoose.model('Apartment', new mongoose.Schema({}, { strict: false }));
      const apartment = await Apartment.findById(apartmentId);
      
      if (apartment) {
        console.log('✅ Apartment found:', {
          id: apartment._id,
          title: apartment.title,
          isActive: apartment.isActive,
          availableRooms: apartment.availableRooms
        });
      } else {
        console.log('❌ Apartment not found');
      }
    }

    // List some apartments to see what's available
    const Apartment = mongoose.model('Apartment', new mongoose.Schema({}, { strict: false }));
    const apartments = await Apartment.find({}).limit(3);
    console.log('📋 Available apartments:');
    apartments.forEach(apt => {
      console.log(`- ${apt._id}: ${apt.title} (Active: ${apt.isActive})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testApartment();
