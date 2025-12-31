import { MenuItem, ReceiptConfig } from './types';

export const MENU_ITEMS: MenuItem[] = [
  { id: 1, name: 'Sukku Coffee', price: 5, category: 'Beverages', imageUrl: 'https://images.unsplash.com/photo-1544787210-2211d44b505b?q=80&w=800&auto=format&fit=crop' },
  { id: 2, name: 'Panipuri', price: 10, category: 'Snacks', imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=800&auto=format&fit=crop' },
  { id: 3, name: 'Samosa', price: 7, category: 'Snacks', imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=800&auto=format&fit=crop' },
  { id: 4, name: 'Chicken Samosa', price: 15, category: 'Non-Veg', imageUrl: 'https://images.unsplash.com/photo-1589113103503-496550341738?q=80&w=800&auto=format&fit=crop' },
  { id: 5, name: 'Mushroom', price: 30, category: 'Snacks', imageUrl: 'https://images.unsplash.com/photo-1541014741259-df549fa9ba6f?q=80&w=800&auto=format&fit=crop' },
  { id: 6, name: 'Bread Omelette', price: 30, category: 'Non-Veg', imageUrl: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?q=80&w=800&auto=format&fit=crop' },
  { id: 7, name: 'Boli', price: 10, category: 'Sweets', imageUrl: 'https://images.unsplash.com/photo-1589114126524-214df839ef4b?q=80&w=800&auto=format&fit=crop' },
  { id: 8, name: 'Momos', price: 10, category: 'Snacks', imageUrl: 'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b4?q=80&w=800&auto=format&fit=crop' },
  { id: 9, name: 'Sandwich', price: 70, category: 'Snacks', imageUrl: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?q=80&w=800&auto=format&fit=crop' },
];

export const DEFAULT_RECEIPT_CONFIG: ReceiptConfig = {
  businessName: "DJ SNACK CORNER",
  address: "288, UDANKUDI ROAD, THATTARMADAM",
  phone: "+91 8220760037",
  logoUrl: "",
  footerMessage: "Thank you for visiting! Have a great day!",
  fontSize: "medium",
  showOrderId: true,
  showDateTime: true
};

export const APP_TITLE = "DJ SNACK CORNER";
export const APP_SUBTITLE = "Point of Sale";