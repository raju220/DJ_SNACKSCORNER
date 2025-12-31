
export interface MenuItem {
  id: number;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export type PaymentMethod = 'Cash' | 'Online';

export interface Order {
  id: string;
  items: CartItem[];
  totalAmount: number;
  amountPaid: number;
  date: string;
  paymentMethod: PaymentMethod;
  syncStatus?: 'synced' | 'pending';
}

export interface ReceiptConfig {
  businessName: string;
  address: string;
  phone: string;
  logoUrl?: string;
  footerMessage: string;
  fontSize: 'small' | 'medium' | 'large';
  showOrderId: boolean;
  showDateTime: boolean;
}

export type Tab = 'menu' | 'history';
