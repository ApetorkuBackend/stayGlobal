// Payment-related type definitions

export interface PaymentMetadata {
  apartmentId?: string;
  checkIn?: string | Date;
  checkOut?: string | Date;
  guests?: number;
  apartmentTitle?: string;
  bookingId?: string;
  [key: string]: any; // Allow additional properties
}

export interface PaymentData {
  amount: number;
  payerId: string;
  metadata?: PaymentMetadata;
  reference?: string;
  status?: string;
}
