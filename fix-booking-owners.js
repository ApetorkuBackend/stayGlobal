const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'apartment-booking';

async function fixBookingOwners() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    
    // Get the real user ID
    const realUser = await db.collection('users').findOne({ email: 'bamenorhu8@gmail.com' });
    if (!realUser) {
      console.log('❌ Real user not found');
      return;
    }
    
    console.log('👤 Real user ID:', realUser.clerkId);
    
    // Update all bookings to belong to the real user as owner
    const result = await db.collection('bookings').updateMany(
      {}, // Update all bookings
      { $set: { ownerId: realUser.clerkId } }
    );
    
    console.log('📅 Updated bookings:', result.modifiedCount);
    
    // Verify the update
    const bookings = await db.collection('bookings').find({}).toArray();
    console.log('📊 Bookings after update:');
    bookings.forEach(booking => {
      console.log(`- Booking ${booking.ticketCode} (Owner: ${booking.ownerId})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

fixBookingOwners();
