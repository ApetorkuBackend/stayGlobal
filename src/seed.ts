import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Apartment from './models/Apartment';

dotenv.config();

const sampleApartments = [
  {
    title: "Modern Downtown Loft",
    description: "Stylish loft in the heart of downtown with city views and modern amenities.",
    location: {
      country: "United States",
      region: "California",
      town: "San Francisco",
      address: "123 Market Street, San Francisco, CA 94102",
      coordinates: {
        latitude: 37.7749,
        longitude: -122.4194
      }
    },
    price: 150,
    totalRooms: 2,
    availableRooms: 2,
    images: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800"
    ],
    amenities: ["WiFi", "AC", "Kitchen", "Parking", "Gym"],
    rating: 4.8,
    reviews: 127,
    ownerId: "owner1",
    ownerName: "John Smith",
    ownerEmail: "john@example.com",
    ownerPaymentAccount: {
      provider: "paystack",
      subaccountCode: "ACCT_8f4k1eq7f22f7lz",
      accountNumber: "0123456789",
      bankCode: "044"
    },
    isActive: true
  },
  {
    title: "Cozy Beach House",
    description: "Beautiful beach house with ocean views and private beach access.",
    location: {
      country: "United States",
      region: "Florida",
      town: "Miami",
      address: "456 Ocean Drive, Miami Beach, FL 33139",
      coordinates: {
        latitude: 25.7617,
        longitude: -80.1918
      }
    },
    price: 200,
    totalRooms: 3,
    availableRooms: 3,
    images: [
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800"
    ],
    amenities: ["WiFi", "AC", "Kitchen", "Pool"],
    rating: 4.9,
    reviews: 89,
    ownerId: "owner2",
    ownerName: "Sarah Johnson",
    ownerEmail: "sarah@example.com",
    ownerPaymentAccount: {
      provider: "momo",
      momoNumber: "+1234567890"
    },
    isActive: true
  },
  {
    title: "Mountain Cabin Retreat",
    description: "Peaceful cabin in the mountains perfect for a quiet getaway.",
    location: {
      country: "United States",
      region: "Colorado",
      town: "Aspen",
      address: "789 Mountain View Road, Aspen, CO 81611",
      coordinates: {
        latitude: 39.1911,
        longitude: -106.8175
      }
    },
    price: 120,
    totalRooms: 2,
    availableRooms: 2,
    images: [
      "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800",
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800"
    ],
    amenities: ["WiFi", "Kitchen", "Garden"],
    rating: 4.7,
    reviews: 156,
    ownerId: "owner3",
    ownerName: "Mike Wilson",
    ownerEmail: "mike@example.com",
    ownerPaymentAccount: {
      provider: "paystack",
      subaccountCode: "ACCT_9g5l2fr8g33g8ma",
      accountNumber: "9876543210",
      bankCode: "058"
    },
    isActive: true
  },
  {
    title: "Urban Studio Apartment",
    description: "Compact and efficient studio in a vibrant neighborhood.",
    location: {
      country: "United States",
      region: "New York",
      town: "New York City",
      address: "321 Broadway, New York, NY 10007",
      coordinates: {
        latitude: 40.7128,
        longitude: -74.0060
      }
    },
    price: 100,
    totalRooms: 1,
    availableRooms: 1,
    images: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800",
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800"
    ],
    amenities: ["WiFi", "AC", "Kitchen"],
    rating: 4.5,
    reviews: 203,
    ownerId: "owner4",
    ownerName: "Emily Davis",
    ownerEmail: "emily@example.com",
    ownerPaymentAccount: {
      provider: "momo",
      momoNumber: "0591985228",
      momoProvider: "mtn"
    },
    isActive: true
  },
  {
    title: "Luxury Penthouse Suite",
    description: "Elegant penthouse with panoramic city views and premium amenities.",
    location: {
      country: "United States",
      region: "Illinois",
      town: "Chicago",
      address: "555 Lake Shore Drive, Chicago, IL 60611",
      coordinates: {
        latitude: 41.8781,
        longitude: -87.6298
      }
    },
    price: 300,
    totalRooms: 4,
    availableRooms: 4,
    images: [
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800"
    ],
    amenities: ["WiFi", "AC", "Kitchen", "Gym", "Security"],
    rating: 4.9,
    reviews: 78,
    ownerId: "owner5",
    ownerName: "Robert Brown",
    ownerEmail: "robert@example.com",
    ownerPaymentAccount: {
      provider: "paystack",
      subaccountCode: "ACCT_0h6m3gs9h44h9nb",
      accountNumber: "5555666677",
      bankCode: "011"
    },
    isActive: true
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');

    // Clear existing apartments
    await Apartment.deleteMany({});
    console.log('Cleared existing apartments');

    // Insert sample apartments
    const apartments = await Apartment.insertMany(sampleApartments);
    console.log(`Inserted ${apartments.length} sample apartments`);

    console.log('Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
