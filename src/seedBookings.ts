import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Booking from './models/Booking';
import Apartment from './models/Apartment';

dotenv.config();

async function seedBookings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');

    // Get some apartments to create bookings for
    const apartments = await Apartment.find().limit(3);
    if (apartments.length === 0) {
      console.log('No apartments found. Please run the apartment seed first.');
      process.exit(1);
    }

    // Clear existing bookings
    await Booking.deleteMany({});
    console.log('Cleared existing bookings');

    // Get current date and create future dates for testing
    const now = new Date();
    const futureDate1 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
    const futureDate2 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks from now
    const futureDate3 = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000); // 3 weeks from now
    const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    // Sample bookings for testing
    const sampleBookings = [
      {
        apartmentId: apartments[0]._id,
        guestId: 'user_2z0oYcxRj5w8i7kOqqH2JJ1smLC', // Real Clerk user ID from logs
        guestName: 'Test User',
        guestEmail: 'bamenorhu8@gmail.com',
        guestPhone: '+1234567890',
        checkIn: futureDate1,
        checkOut: new Date(futureDate1.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days later
        guests: 2,
        totalAmount: 450,
        paymentStatus: 'paid',
        paymentMethod: 'paystack',
        bookingStatus: 'confirmed',
        specialRequests: 'Late check-in requested',
        ticketCode: 'TEST001A'
      },
      {
        apartmentId: apartments[1]._id,
        guestId: 'user_2z0oYcxRj5w8i7kOqqH2JJ1smLC',
        guestName: 'Test User',
        guestEmail: 'bamenorhu8@gmail.com',
        guestPhone: '+1234567890',
        checkIn: futureDate2,
        checkOut: new Date(futureDate2.getTime() + 4 * 24 * 60 * 60 * 1000), // 4 days later
        guests: 1,
        totalAmount: 800,
        paymentStatus: 'paid',
        paymentMethod: 'momo',
        bookingStatus: 'confirmed',
        ticketCode: 'TEST002B'
      },
      {
        apartmentId: apartments[2]._id,
        guestId: 'user_2z0oYcxRj5w8i7kOqqH2JJ1smLC',
        guestName: 'Test User',
        guestEmail: 'bamenorhu8@gmail.com',
        guestPhone: '+1234567890',
        checkIn: pastDate,
        checkOut: new Date(pastDate.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days later
        guests: 2,
        totalAmount: 240,
        paymentStatus: 'paid',
        paymentMethod: 'card',
        bookingStatus: 'completed',
        ticketCode: 'TEST003C'
      },
      {
        apartmentId: apartments[0]._id,
        guestId: 'user_2z0oYcxRj5w8i7kOqqH2JJ1smLC',
        guestName: 'Test User',
        guestEmail: 'bamenorhu8@gmail.com',
        guestPhone: '+1234567890',
        checkIn: futureDate3,
        checkOut: new Date(futureDate3.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days later
        guests: 3,
        totalAmount: 750,
        paymentStatus: 'pending',
        paymentMethod: 'paystack',
        bookingStatus: 'confirmed',
        specialRequests: 'Need parking space',
        ticketCode: 'TEST004D'
      }
    ];

    // Insert sample bookings one by one to handle validation
    const bookings = [];
    for (const bookingData of sampleBookings) {
      try {
        const booking = new Booking(bookingData);
        await booking.save();
        bookings.push(booking);
      } catch (error: any) {
        console.log(`Skipping booking due to validation error:`, error.message);
        // For completed bookings, we'll bypass the date validation
        if (bookingData.bookingStatus === 'completed') {
          const booking = new Booking(bookingData);
          // Temporarily disable validation for this save
          await booking.save({ validateBeforeSave: false });
          bookings.push(booking);
        }
      }
    }
    console.log(`Inserted ${bookings.length} sample bookings`);

    // Display created bookings
    console.log('\nCreated bookings:');
    bookings.forEach((booking, index) => {
      console.log(`${index + 1}. ${booking.ticketCode} - ${booking.bookingStatus} - $${booking.totalAmount}`);
    });

    console.log('\nBookings seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding bookings:', error);
    process.exit(1);
  }
}

seedBookings();
