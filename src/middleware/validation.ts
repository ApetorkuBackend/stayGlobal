import { Request, Response, NextFunction } from 'express';

export const validateApartment = (req: Request, res: Response, next: NextFunction): void => {
  console.log('🔍 Validating apartment data...');
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));

  const { title, description, location, price, totalRooms, availableRooms, amenities, images } = req.body;

  const errors: string[] = [];

  console.log('🔍 Checking title:', title);
  if (!title || title.trim().length === 0) {
    errors.push('Title is required');
  }

  console.log('🔍 Checking description:', description);
  // Description is optional for now - can be empty
  // if (!description || description.trim().length === 0) {
  //   errors.push('Description is required');
  // }

  console.log('🔍 Checking location:', location);
  if (!location || !location.country || !location.region || !location.town || !location.address) {
    errors.push('Complete location information is required');
    console.log('❌ Location validation failed:', {
      hasLocation: !!location,
      hasCountry: location?.country,
      hasRegion: location?.region,
      hasTown: location?.town,
      hasAddress: location?.address
    });
  }

  console.log('🔍 Checking price:', price);
  if (!price || price <= 0) {
    errors.push('Valid price is required');
  }

  console.log('🔍 Checking totalRooms:', totalRooms);
  if (!totalRooms || totalRooms < 1) {
    errors.push('Total rooms must be at least 1');
  }

  console.log('🔍 Checking images:', images);
  if (!images || !Array.isArray(images) || images.length === 0) {
    errors.push('At least one image is required');
  }

  if (errors.length > 0) {
    console.log('❌ Validation failed with errors:', errors);
    res.status(400).json({ error: 'Validation failed', details: errors });
    return;
  }

  console.log('✅ Validation passed');
  next();
};

export const validateBooking = (req: Request, res: Response, next: NextFunction): void => {
  const { apartmentId, checkIn, checkOut, guests, paymentMethod } = req.body;

  const errors: string[] = [];

  if (!apartmentId) {
    errors.push('Apartment ID is required');
  }

  if (!checkIn) {
    errors.push('Check-in date is required');
  }

  if (!checkOut) {
    errors.push('Check-out date is required');
  }

  if (!guests || guests < 1) {
    errors.push('Number of guests must be at least 1');
  }

  // Skip payment method validation for now - allow bookings without payment
  console.log('🔍 Skipping payment method validation - bookings allowed without payment');

  // Validate dates
  if (checkIn && checkOut) {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate.getTime())) {
      errors.push('Invalid check-in date');
    }

    if (isNaN(checkOutDate.getTime())) {
      errors.push('Invalid check-out date');
    }

    if (checkInDate >= checkOutDate) {
      errors.push('Check-out date must be after check-in date');
    }
  }

  if (errors.length > 0) {
    res.status(400).json({ error: 'Validation failed', details: errors });
    return;
  }

  next();
};
