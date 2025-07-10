import Booking from '../models/Booking';
import NotificationService from './notificationService';

export class AutoCheckoutService {
  // Check for bookings that need auto check-out
  static async processAutoCheckouts(): Promise<void> {
    try {
      console.log('🔄 Starting auto checkout process...');
      
      const now = new Date();
      
      // Find all bookings that are checked-in but past their checkout date
      const expiredBookings = await Booking.find({
        bookingStatus: 'checked-in',
        checkOut: { $lte: now },
        roomNumber: { $exists: true, $ne: null }
      }).populate('apartmentId', 'title ownerId');

      console.log(`📋 Found ${expiredBookings.length} bookings ready for auto checkout`);

      let processedCount = 0;
      
      for (const booking of expiredBookings) {
        try {
          // Update booking status to completed and set checkout time
          booking.bookingStatus = 'completed';
          booking.checkOutTime = now;
          
          await booking.save();
          
          // Create notification for house owner
          await NotificationService.createAutoCheckoutNotification(booking);
          
          console.log(`✅ Auto checked out: ${booking.guestName} from Room ${booking.roomNumber} (Booking: ${booking.ticketCode})`);
          processedCount++;
          
        } catch (error) {
          console.error(`❌ Error auto checking out booking ${booking._id}:`, error);
        }
      }
      
      if (processedCount > 0) {
        console.log(`🎉 Auto checkout completed: ${processedCount} guests checked out`);
      } else {
        console.log('✅ No bookings required auto checkout');
      }
      
    } catch (error) {
      console.error('❌ Error in auto checkout process:', error);
    }
  }

  // Get bookings that will expire soon (for reminders)
  static async getUpcomingCheckouts(hoursAhead: number = 2): Promise<any[]> {
    try {
      const now = new Date();
      const futureTime = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));
      
      const upcomingCheckouts = await Booking.find({
        bookingStatus: 'checked-in',
        checkOut: { 
          $gte: now,
          $lte: futureTime 
        },
        roomNumber: { $exists: true, $ne: null }
      }).populate('apartmentId', 'title ownerId');

      return upcomingCheckouts;
    } catch (error) {
      console.error('❌ Error getting upcoming checkouts:', error);
      return [];
    }
  }

  // Send reminder notifications for upcoming checkouts
  static async sendCheckoutReminders(): Promise<void> {
    try {
      console.log('🔔 Checking for upcoming checkout reminders...');
      
      const upcomingCheckouts = await this.getUpcomingCheckouts(2); // 2 hours ahead
      
      for (const booking of upcomingCheckouts) {
        try {
          const apartment = booking.apartmentId;
          if (!apartment) continue;

          const checkoutTime = new Date(booking.checkOut).toLocaleString();
          
          await NotificationService.createNotification({
            userId: apartment.ownerId,
            type: 'booking_reminder',
            title: 'Upcoming Guest Checkout',
            message: `${booking.guestName} in Room ${booking.roomNumber} is scheduled to check out at ${checkoutTime}`,
            bookingId: booking._id.toString(),
            apartmentId: booking.apartmentId._id.toString(),
            guestName: booking.guestName,
            roomNumber: booking.roomNumber,
            priority: 'low'
          });
          
          console.log(`🔔 Reminder sent for upcoming checkout: ${booking.guestName} - Room ${booking.roomNumber}`);
          
        } catch (error) {
          console.error(`❌ Error sending reminder for booking ${booking._id}:`, error);
        }
      }
      
    } catch (error) {
      console.error('❌ Error in checkout reminder process:', error);
    }
  }

  // Send checkout reminders to renters (1 hour before checkout)
  static async sendRenterCheckoutReminders(): Promise<void> {
    try {
      console.log('🔔 Checking for renter checkout reminders...');

      const oneHourFromNow = new Date();
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

      const thirtyMinutesFromNow = new Date();
      thirtyMinutesFromNow.setMinutes(thirtyMinutesFromNow.getMinutes() + 30);

      // Find bookings that will checkout in the next 30 minutes to 1 hour
      const upcomingCheckouts = await Booking.find({
        bookingStatus: 'checked-in',
        checkOut: {
          $gte: thirtyMinutesFromNow,
          $lte: oneHourFromNow
        },
        roomNumber: { $exists: true, $ne: null }
      }).populate('apartmentId', 'title ownerId');

      console.log(`📋 Found ${upcomingCheckouts.length} upcoming checkouts for renter reminders`);

      for (const booking of upcomingCheckouts) {
        try {
          const apartment = booking.apartmentId;
          if (!apartment) continue;

          const checkoutTime = new Date(booking.checkOut);
          const timeUntilCheckout = Math.round((checkoutTime.getTime() - Date.now()) / (1000 * 60)); // minutes

          await NotificationService.createNotification({
            userId: booking.guestId,
            type: 'checkout_reminder',
            title: 'Checkout Reminder ⏰',
            message: `Your checkout time is approaching! You need to check out in ${timeUntilCheckout} minutes (${checkoutTime.toLocaleTimeString()}) from ${(apartment as any).title}${booking.roomNumber ? ` - Room ${booking.roomNumber}` : ''}.`,
            bookingId: (booking._id as string).toString(),
            apartmentId: booking.apartmentId._id.toString(),
            guestName: booking.guestName,
            roomNumber: booking.roomNumber,
            priority: 'high'
          });

          console.log(`🔔 Renter reminder sent: ${booking.guestName} - ${timeUntilCheckout} minutes until checkout`);

        } catch (error) {
          console.error(`❌ Error sending renter reminder for booking ${booking._id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Error in renter checkout reminder process:', error);
    }
  }

  // Start the auto checkout scheduler
  static startScheduler(): void {
    console.log('🚀 Starting auto checkout scheduler...');
    
    // Run auto checkout every 30 minutes
    setInterval(async () => {
      await this.processAutoCheckouts();
    }, 30 * 60 * 1000); // 30 minutes
    
    // Send owner reminders every hour
    setInterval(async () => {
      await this.sendCheckoutReminders();
    }, 60 * 60 * 1000); // 1 hour

    // Send renter reminders every 15 minutes (more frequent for urgency)
    setInterval(async () => {
      await this.sendRenterCheckoutReminders();
    }, 15 * 60 * 1000); // 15 minutes

    // Run initial check
    setTimeout(async () => {
      await this.processAutoCheckouts();
      await this.sendCheckoutReminders();
      await this.sendRenterCheckoutReminders();
    }, 5000); // 5 seconds after startup
    
    console.log('✅ Auto checkout scheduler started');
  }

  // Manual trigger for testing
  static async runManualCheckout(): Promise<{ processed: number; upcoming: number }> {
    console.log('🔧 Manual auto checkout triggered...');
    
    await this.processAutoCheckouts();
    const upcoming = await this.getUpcomingCheckouts();
    
    return {
      processed: 0, // Would need to track this in processAutoCheckouts
      upcoming: upcoming.length
    };
  }
}

export default AutoCheckoutService;
