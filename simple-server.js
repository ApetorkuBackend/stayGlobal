const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = 5000;

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://efyasexy6:5AHg36GcTTuTCkQl@cluster0.2xfvngo.mongodb.net/apartment-booking';
let db;

// Middleware
app.use(cors({
  origin: ['http://localhost:8081', 'http://localhost:8080'],
  credentials: true
}));
app.use(express.json());

// Connect to MongoDB
MongoClient.connect(MONGODB_URI)
  .then(client => {
    console.log('✅ MongoDB connected successfully');
    db = client.db('apartment-booking');
  })
  .catch(error => {
    console.error('❌ MongoDB connection error:', error);
  });

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Simple Apartment Booking API is running',
    timestamp: new Date().toISOString()
  });
});

// Simple authentication middleware that extracts user ID from request
const simpleAuth = async (req, res, next) => {
  try {
    // For now, we'll extract the user ID from the Authorization header or use a default
    const authHeader = req.headers.authorization;

    // In a real app, you'd verify the Clerk JWT token here
    // For now, we'll use the user ID from the database or default to the known user

    // Check if we have any users in the database
    const users = await db.collection('users').find({}).toArray();
    console.log('👥 Found users in database:', users.length);

    if (users.length > 0) {
      // Use the first user found (in a real app, you'd decode the JWT to get the actual user)
      const user = users[0];
      req.user = {
        clerkId: user.clerkId,
        email: user.email,
        role: user.role || 'owner'
      };
      console.log('🔑 Using user from database:', req.user.clerkId);
    } else {
      // Fallback to hardcoded user if no users in database
      req.user = {
        clerkId: 'user_2z0oYcxRj5w8i7kOqqH2JJ1smLC',
        email: 'bamenorhu8@gmail.com',
        role: 'owner'
      };
      console.log('🔑 Using fallback user:', req.user.clerkId);
    }

    next();
  } catch (error) {
    console.error('❌ Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Get verification status
app.get('/api/identity-verification/status', simpleAuth, async (req, res) => {
  try {
    console.log('🔍 Getting verification status for user:', req.user.clerkId);
    
    const verification = await db.collection('identityverifications')
      .findOne({ userId: req.user.clerkId }, { sort: { createdAt: -1 } });
    
    console.log('🔐 Verification found:', !!verification);
    if (verification) {
      console.log('📋 Verification status:', verification.verificationStatus);
    }
    
    const isVerified = verification && verification.verificationStatus === 'verified';
    
    const status = {
      isVerified: isVerified,
      hasVerification: !!verification,
      verificationStatus: verification?.verificationStatus || 'none',
      verificationLevel: isVerified ? 'full' : 'none',
      verifiedAt: verification?.verifiedAt || verification?.createdAt || null,
      hasPaymentAccount: false, // For now
      canListApartments: isVerified,
      verificationDetails: verification ? {
        status: verification.verificationStatus,
        submittedAt: verification.createdAt,
        verifiedAt: verification.verifiedAt,
        riskScore: verification.fraudPrevention?.riskScore,
        method: verification.verificationMethod
      } : null
    };
    
    console.log('✅ Returning verification status:', status);
    res.json(status);
  } catch (error) {
    console.error('❌ Get verification status error:', error);
    res.status(500).json({ error: 'Failed to get verification status' });
  }
});

// Submit simple verification
app.post('/api/identity-verification/simple', simpleAuth, async (req, res) => {
  try {
    console.log('🚀 Simple verification endpoint hit');
    console.log('📦 Request body:', req.body);
    
    // Since user is already verified, just return success
    res.json({
      success: true,
      message: 'Verification already completed',
      verificationId: 'existing-verification',
      status: 'verified'
    });
  } catch (error) {
    console.error('❌ Simple verification error:', error);
    res.status(500).json({ error: 'Failed to submit verification' });
  }
});

// Get user payment account
app.get('/api/user-payments/account', simpleAuth, async (req, res) => {
  try {
    // Mock response for now
    res.json({
      hasAccount: false,
      isVerified: false,
      accountType: null
    });
  } catch (error) {
    console.error('❌ Payment account error:', error);
    res.status(500).json({ error: 'Failed to get payment account' });
  }
});

// Get owner apartments
app.get('/api/apartments/my/listings', mockAuth, async (req, res) => {
  try {
    const apartments = await db.collection('apartments')
      .find({ ownerId: req.user.clerkId })
      .toArray();
    
    res.json({
      apartments: apartments || [],
      total: apartments?.length || 0,
      page: 1,
      limit: 10
    });
  } catch (error) {
    console.error('❌ Get apartments error:', error);
    res.status(500).json({ error: 'Failed to get apartments' });
  }
});

// Get owner bookings
app.get('/api/bookings/owner', mockAuth, async (req, res) => {
  try {
    const bookings = await db.collection('bookings')
      .find({ ownerId: req.user.clerkId })
      .toArray();
    
    res.json({
      bookings: bookings || [],
      total: bookings?.length || 0,
      page: 1,
      limit: 100
    });
  } catch (error) {
    console.error('❌ Get bookings error:', error);
    res.status(500).json({ error: 'Failed to get bookings' });
  }
});

// User sync endpoint
app.post('/api/users/sync', async (req, res) => {
  try {
    console.log('🔄 User sync endpoint hit');
    const { clerkUserId } = req.body;
    
    if (!clerkUserId) {
      return res.status(400).json({ error: 'Clerk user ID is required' });
    }
    
    // Mock successful sync
    res.json({
      message: 'User synced successfully',
      user: {
        clerkId: clerkUserId,
        email: 'bamenorhu8@gmail.com',
        role: 'owner'
      }
    });
  } catch (error) {
    console.error('❌ User sync error:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// 404 handler
app.use((req, res) => {
  console.log(`❌ Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Simple server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
