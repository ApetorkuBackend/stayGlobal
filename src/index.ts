import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import { clerkMiddleware } from '@clerk/express';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://localhost:8082',  // Add port 8082 for frontend
    'https://stayglobal.vercel.app',
    'https://stay-global.vercel.app',
    'https://stayglobal-git-main-apetorkus-projects.vercel.app',
    /\.vercel\.app$/  // Allow all Vercel preview deployments
  ],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// Clerk authentication middleware
app.use(clerkMiddleware());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Apartment Booking API is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
import apartmentRoutes from './routes/apartments';
import bookingRoutes from './routes/bookings';
import userRoutes from './routes/users';
import paymentRoutes from './routes/paymentRoutes';
import userPaymentRoutes from './routes/userPaymentRoutes';
import paystackRoutes from './routes/paystackRoutes';
import identityVerificationRoutes from './routes/identityVerificationRoutes';
import notificationRoutes from './routes/notifications';
import chatRoutes from './routes/chats';
import adminRoutes from './routes/adminRoutes';
import adminChatRoutes from './routes/adminChatRoutes';
import AutoCheckoutService from './services/autoCheckoutService';

app.use('/api/apartments', (req, res, next) => {
  console.log(`🏠 Apartment route hit: ${req.method} ${req.path}`);
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  console.log('📋 Request headers:', req.headers);
  next();
}, apartmentRoutes);
app.use('/api/bookings', (req, res, next) => {
  console.log(`📋 Booking route hit: ${req.method} ${req.path}`);
  console.log('🔐 Authorization header:', req.headers.authorization ? 'Present' : 'Missing');
  if (req.method === 'PATCH') {
    console.log('📦 PATCH Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
}, bookingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/user-payments', (req, res, next) => {
  console.log(`💳 User Payment route hit: ${req.method} ${req.path}`);
  console.log('🔐 Authorization header:', req.headers.authorization ? 'Present' : 'Missing');
  next();
}, userPaymentRoutes);
app.use('/api/paystack', paystackRoutes);
app.use('/api/identity-verification', identityVerificationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin-chat', adminChatRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler - use a different pattern to avoid path-to-regexp issues
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);

      // Start auto checkout scheduler
      AutoCheckoutService.startScheduler();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
