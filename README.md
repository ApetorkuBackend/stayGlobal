# Apartment Booking Backend API

A Node.js/Express backend API for an apartment booking application with MongoDB and Clerk authentication.

## Features

- **Authentication**: Clerk integration for user management
- **Database**: MongoDB with Mongoose ODM
- **API Endpoints**: RESTful APIs for apartments, bookings, and users
- **TypeScript**: Full TypeScript support
- **Validation**: Request validation middleware
- **Security**: Helmet, CORS, and authentication middleware

## Tech Stack

- Node.js + Express
- TypeScript
- MongoDB + Mongoose
- Clerk Authentication
- Helmet (Security)
- CORS
- Morgan (Logging)

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud)
- Clerk account for authentication

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/apartment-booking
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
```

### Development

Start the development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Start production server:
```bash
npm start
```

## API Endpoints

### Health Check
- `GET /api/health` - Server health status

### Apartments
- `GET /api/apartments` - Get all apartments (with filtering)
- `GET /api/apartments/:id` - Get apartment by ID
- `POST /api/apartments` - Create apartment (owner/admin only)
- `PUT /api/apartments/:id` - Update apartment (owner/admin only)
- `DELETE /api/apartments/:id` - Delete apartment (owner/admin only)
- `GET /api/apartments/my/listings` - Get user's apartments (owner/admin only)

### Bookings
- `POST /api/bookings` - Create booking (authenticated)
- `GET /api/bookings/my` - Get user's bookings (authenticated)
- `GET /api/bookings/:id` - Get booking by ID (authenticated)
- `PATCH /api/bookings/:id/cancel` - Cancel booking (authenticated)
- `GET /api/bookings/apartment/:apartmentId` - Get apartment bookings (owner/admin only)
- `PATCH /api/bookings/:id/payment` - Update payment status (admin only)

### Users
- `GET /api/users/profile` - Get user profile (authenticated)
- `PATCH /api/users/profile` - Update user profile (authenticated)
- `POST /api/users/sync` - Sync user with Clerk
- `POST /api/users/webhook/create` - Clerk webhook for user creation

## Database Models

### User
- Clerk integration with additional profile data
- Roles: guest, owner, admin
- Preferences and settings

### Apartment
- Property details and location
- Pricing and availability
- Owner information
- Images and amenities

### Booking
- Guest and apartment information
- Check-in/check-out dates
- Payment and booking status
- Unique ticket codes

## Authentication

The API uses Clerk for authentication. Users are automatically synced between Clerk and the local database. Different endpoints require different permission levels:

- **Public**: Health check, apartment listings
- **Authenticated**: Bookings, user profile
- **Owner/Admin**: Apartment management
- **Admin**: Payment management

## Development Notes

- MongoDB connection is optional in development mode
- All routes include proper TypeScript types
- Request validation middleware prevents invalid data
- Error handling middleware provides consistent error responses
