const axios = require('axios');

// Test booking creation with mobile money
async function testBooking() {
  const bookingData = {
    apartmentId: "60f7b3b3b3b3b3b3b3b3b3b3", // Replace with actual apartment ID
    checkIn: "2025-07-10",
    checkOut: "2025-07-12", 
    guests: 2,
    paymentMethod: "momo",
    paymentDetails: {
      momoNumber: "0540760548",
      momoProvider: "mtn"
    }
  };

  try {
    console.log('Testing booking with data:', JSON.stringify(bookingData, null, 2));
    
    const response = await axios.post('http://localhost:5000/api/bookings', bookingData, {
      headers: {
        'Content-Type': 'application/json',
        // You'll need to add a valid auth token here
        'Authorization': 'Bearer YOUR_AUTH_TOKEN'
      }
    });
    
    console.log('Success:', response.data);
  } catch (error) {
    console.log('Error status:', error.response?.status);
    console.log('Error data:', error.response?.data);
    console.log('Full error:', error.message);
  }
}

// Test mobile money number validation
function testMomoValidation() {
  const validateMomoNumber = (number, provider) => {
    const cleanNumber = number.replace(/\s+/g, '');

    switch (provider) {
      case 'mtn':
        return /^(0?24|0?54|0?55|0?59)\d{7}$/.test(cleanNumber);
      case 'vodafone':
        return /^(0?20|0?50)\d{7}$/.test(cleanNumber);
      case 'airteltigo':
        return /^(0?26|0?27|0?56|0?57)\d{7}$/.test(cleanNumber);
      default:
        return false;
    }
  };

  const testNumber = "0540760548";
  const provider = "mtn";
  
  console.log(`Testing number: ${testNumber} with provider: ${provider}`);
  console.log(`Is valid: ${validateMomoNumber(testNumber, provider)}`);
  
  // Test different formats
  console.log('Testing different formats:');
  console.log('0540760548 (MTN):', validateMomoNumber('0540760548', 'mtn'));
  console.log('540760548 (MTN):', validateMomoNumber('540760548', 'mtn'));
  console.log('024XXXXXXX (MTN):', validateMomoNumber('0241234567', 'mtn'));
}

console.log('=== Mobile Money Validation Test ===');
testMomoValidation();

console.log('\n=== Booking API Test ===');
console.log('Note: You need to add a valid auth token to test the booking API');
// testBooking();
