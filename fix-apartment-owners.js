const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'apartment-booking';

async function fixApartmentOwners() {
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
    
    // Update all apartments to belong to the real user
    const result = await db.collection('apartments').updateMany(
      {}, // Update all apartments
      { $set: { ownerId: realUser.clerkId } }
    );
    
    console.log('🏠 Updated apartments:', result.modifiedCount);
    
    // Verify the update
    const apartments = await db.collection('apartments').find({}).toArray();
    console.log('📊 Apartments after update:');
    apartments.forEach(apartment => {
      console.log(`- ${apartment.title} (Owner: ${apartment.ownerId})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

fixApartmentOwners();
