
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ShoppingCart, History as HistoryIcon, Search, Plus, Minus, 
  UtensilsCrossed, Loader2, CreditCard, Banknote, X, 
  ChevronRight, Trash2, Save, Lock, LogOut, BarChart3, 
  Settings2, CheckCircle2, UserCircle, TrendingUp, Package, 
  IndianRupee, Upload, Zap, PieChart, LayoutGrid, Hash, 
  Calendar, Receipt, CupSoda, Cookie, CakeSlice, Drumstick, 
  Sparkles, Image as ImageIcon, RefreshCw,
  Sun, Moon, WifiOff, DollarSign, PenSquare, Type, AlertTriangle,
  Wifi, Cloud
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { ref, onValue, set, remove } from "firebase/database";
import { db } from "./firebase";
import { MENU_ITEMS, APP_TITLE, APP_SUBTITLE, DEFAULT_RECEIPT_CONFIG } from './constants';
import { CartItem, Order, Tab, PaymentMethod, MenuItem, ReceiptConfig } from './types';
import { formatCurrency, generateOrderId, formatDate } from './utils/helpers';
import { OrderHistory } from './components/OrderHistory';

export default function App() {
  // --- THEME & PERSISTENCE ---
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_theme');
      return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('pos_theme', darkMode ? 'dark' : 'light');
    } catch (e) {
      console.warn('Unable to save theme preference');
    }
  }, [darkMode]);

  // --- CORE STATE ---
  const [activeTab, setActiveTab] = useState<Tab>('menu');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [firebaseOrders, setFirebaseOrders] = useState<Order[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('pos_pending_orders');
    return saved ? JSON.parse(saved) : [];
  });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(DEFAULT_RECEIPT_CONFIG);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // UI Controls
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminTab, setAdminTab] = useState<'analytics' | 'assets' | 'branding'>('analytics');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Admin Editing States
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemForm, setItemForm] = useState<Partial<MenuItem>>({ name: '', price: 0, category: '', imageUrl: '' });
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- OFFLINE SYNC LOGIC ---
  const syncPendingOrders = async () => {
    const ordersToSync = [...pendingOrders];
    if (ordersToSync.length === 0 || !navigator.onLine) return;

    setIsSyncing(true);
    showNotification(`Syncing ${ordersToSync.length} offline orders...`, 'success');

    let successCount = 0;
    const remainingPending = [...ordersToSync];

    for (const order of ordersToSync) {
      try {
        await set(ref(db, 'orders/' + order.id.replace('#', '')), { ...order, syncStatus: 'synced' });
        successCount++;
        remainingPending.shift();
      } catch (e) {
        console.error("Failed to sync order", order.id, e);
        break; // Stop if we hit an error (likely network blip)
      }
    }

    setPendingOrders(remainingPending);
    localStorage.setItem('pos_pending_orders', JSON.stringify(remainingPending));
    setIsSyncing(false);

    if (successCount > 0) {
      showNotification(`Successfully synced ${successCount} orders`, 'success');
    }
  };

  useEffect(() => {
    const online = () => { 
      setIsOnline(true); 
      showNotification('Connection restored', 'success');
      syncPendingOrders();
    };
    const offline = () => { 
      setIsOnline(false); 
      showNotification('Working offline', 'error'); 
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    
    // Initial sync check
    if (navigator.onLine) syncPendingOrders();

    return () => { 
      window.removeEventListener('online', online); 
      window.removeEventListener('offline', offline); 
    };
  }, [pendingOrders]);

  // Combined orders for the UI
  const allOrders = useMemo(() => {
    const combined = [...pendingOrders, ...firebaseOrders];
    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [firebaseOrders, pendingOrders]);

  // --- DATA SYNC ---
  useEffect(() => {
    // Sync Orders
    const unsubscribeOrders = onValue(ref(db, 'orders'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.values(data) as Order[];
        setFirebaseOrders(list);
      } else setFirebaseOrders([]);
    });

    // Sync Menu Items (Replaces LocalStorage to fix quota limit errors with images)
    const unsubscribeMenu = onValue(ref(db, 'menu'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.values(data) as MenuItem[];
        setMenuItems(list);
        // Create a lightweight offline backup (without images to save space)
        try {
          const liteMenu = list.map(item => ({ ...item, imageUrl: '' }));
          localStorage.setItem('pos_menu_lite', JSON.stringify(liteMenu));
        } catch (e) { /* Ignore backup errors */ }
      } else {
        // Fallback if DB is empty or initial load fails
        const localBackup = localStorage.getItem('pos_menu_lite');
        if (localBackup) {
          setMenuItems(JSON.parse(localBackup));
        } else {
          setMenuItems(MENU_ITEMS);
        }
      }
    });

    return () => {
      unsubscribeOrders();
      unsubscribeMenu();
    };
  }, []);

  useEffect(() => {
    const savedReceipt = localStorage.getItem('pos_receipt_config');
    if (savedReceipt) setReceiptConfig(JSON.parse(savedReceipt));
  }, []);

  // --- ACTIONS ---
  const showNotification = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginForm.username === 'admin' && loginForm.password === '1234') {
      setIsAdminLoggedIn(true);
      setShowLoginModal(false);
      setShowAdminPanel(true);
      showNotification('Access Granted', 'success');
      setLoginForm({ username: '', password: '' });
    } else {
      showNotification('Invalid Credentials', 'error');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showNotification('File too large (Max 2MB)', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setItemForm(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAIGenerate = async () => {
    if (!itemForm.name || itemForm.name.length < 3) {
      showNotification('Enter a descriptive name', 'error');
      return;
    }
    setIsGeneratingImage(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: `Create a professional, high-quality food photograph of ${itemForm.name} (${itemForm.category || 'Food'}). The image should be appetizing, well-lit, studio quality, centered composition on a neutral background.`,
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (part?.inlineData) {
        setItemForm(prev => ({ 
          ...prev, 
          imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` 
        }));
        showNotification('Image Crafted by AI', 'success');
      } else {
        console.warn("AI Response did not contain image data:", response);
        throw new Error('No image returned');
      }
    } catch (e) {
      console.error("AI Generation Error:", e);
      showNotification('AI Crafting Failed', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (!existing && delta > 0) {
        const item = menuItems.find(i => i.id === id);
        return item ? [...prev, { ...item, quantity: 1 }] : prev;
      }
      if (existing) {
        const newQ = existing.quantity + delta;
        return newQ <= 0 ? prev.filter(i => i.id !== id) : prev.map(i => i.id === id ? { ...i, quantity: newQ } : i);
      }
      return prev;
    });
  };

  const totalAmount = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);
  const balance = useMemo(() => (parseFloat(amountPaid) || 0) - totalAmount, [amountPaid, totalAmount]);

  useEffect(() => {
    if (paymentMethod === 'Online' && totalAmount > 0) setAmountPaid(totalAmount.toString());
  }, [totalAmount, paymentMethod]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    
    const newOrder: Order = {
      id: generateOrderId(),
      items: [...cart],
      totalAmount,
      amountPaid: paymentMethod === 'Online' ? totalAmount : (parseFloat(amountPaid) || 0),
      date: new Date().toISOString(),
      paymentMethod,
      syncStatus: 'pending'
    };

    // Optimistically save locally first
    const updatedPending = [...pendingOrders, newOrder];
    setPendingOrders(updatedPending);
    localStorage.setItem('pos_pending_orders', JSON.stringify(updatedPending));

    // Cleanup UI
    setCart([]); 
    setAmountPaid(''); 
    setPaymentMethod('Cash'); 
    setIsMobileCartOpen(false);
    setIsSubmitting(false);
    showNotification("Order saved locally", 'success');

    // Trigger sync attempt
    if (navigator.onLine) syncPendingOrders();
  };

  const getAnalytics = () => {
    const todayStr = new Date().toLocaleDateString();
    const todayOrders = allOrders.filter(o => new Date(o.date).toLocaleDateString() === todayStr);
    const revToday = todayOrders.reduce((s, o) => s + o.totalAmount, 0);
    const revAllTime = allOrders.reduce((s, o) => s + o.totalAmount, 0);
    const avgOrderValue = allOrders.length > 0 ? revAllTime / allOrders.length : 0;
    
    const itemSales: Record<string, number> = {};
    allOrders.forEach(o => o.items.forEach(i => itemSales[i.name] = (itemSales[i.name] || 0) + i.quantity));
    const topItems = Object.entries(itemSales).sort((a,b) => b[1] - a[1]).slice(0, 6).map(e => ({ name: e[0], count: e[1] }));
    const maxItemCount = Math.max(...topItems.map(i => i.count), 1);

    const catSales: Record<string, number> = {};
    allOrders.forEach(o => o.items.forEach(i => catSales[i.category || 'Other'] = (catSales[i.category || 'Other'] || 0) + i.quantity));
    const totalItemsSold = Object.values(catSales).reduce((a,b) => a+b, 0);
    const categoryStats = Object.entries(catSales).sort((a,b) => b[1] - a[1]);

    return { revToday, revAllTime, countToday: todayOrders.length, topItems, avgOrderValue, categoryStats, totalItemsSold, maxItemCount };
  };

  const filteredItems = useMemo(() => menuItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
    (selectedCategory === 'All' || item.category === selectedCategory)
  ), [searchQuery, selectedCategory, menuItems]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(menuItems.map(i => i.category || 'Other')))], [menuItems]);

  const getCategoryIcon = (category?: string, size: number = 24) => {
    const cls = "opacity-50";
    switch(category) {
      case 'Beverages': return <CupSoda size={size} className={cls} />;
      case 'Snacks': return <Cookie size={size} className={cls} />;
      case 'Sweets': return <CakeSlice size={size} className={cls} />;
      case 'Non-Veg': return <Drumstick size={size} className={cls} />;
      default: return <UtensilsCrossed size={size} className={cls} />;
    }
  };

  const renderCart = (isMobile = false) => (
    <div className="flex flex-col h-full bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-l border-white/20 dark:border-white/5 overflow-hidden shadow-2xl">
      <div className={`px-6 py-5 border-b border-dashed border-slate-300 dark:border-white/10 flex justify-between items-center ${isMobile ? 'glass sticky top-0 z-20' : ''}`}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-glow">
            <ShoppingCart size={18} />
          </div>
          <div>
            <h2 className="font-bold text-sm uppercase tracking-wider dark:text-white">Current Order</h2>
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">{cart.length} Items</p>
          </div>
        </div>
        {isMobile && <button onClick={() => setIsMobileCartOpen(false)} className="p-2 bg-slate-100 dark:bg-white/10 rounded-full tap-scale"><X size={18} /></button>}
        {!isMobile && cart.length > 0 && <button onClick={() => setCart([])} className="text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-full tap-scale transition-colors">Clear</button>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide overscroll-contain">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 scale-95">
             <div className="p-6 rounded-full bg-slate-100 dark:bg-white/5 mb-4 animate-pulse-slow">
               <UtensilsCrossed size={48} className="text-slate-400" />
             </div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Cart Empty</p>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.id} className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5 flex items-center gap-3 animate-slide-up group">
              <div className="flex-1">
                <p className="font-bold text-xs text-slate-800 dark:text-slate-100 leading-tight">{item.name}</p>
                <p className="text-[10px] text-indigo-500 font-bold mt-0.5">{formatCurrency(item.price)}</p>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-1 rounded-xl">
                <button onClick={() => updateQuantity(item.id, -1)} className="p-1.5 hover:bg-white dark:hover:bg-slate-600 text-red-500 rounded-lg tap-scale transition-colors"><Minus size={12} strokeWidth={3} /></button>
                <span className="w-5 text-center text-xs font-black dark:text-white tabular-nums">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.id, 1)} className="p-1.5 hover:bg-white dark:hover:bg-slate-600 text-indigo-600 rounded-lg tap-scale transition-colors"><Plus size={12} strokeWidth={3} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-white/5 space-y-5 shadow-inner-light">
        <div className="flex justify-between items-end">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Total Due</span>
          <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">{formatCurrency(totalAmount)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setPaymentMethod('Cash'); setAmountPaid(''); }} className={`py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-all tap-scale border ${paymentMethod === 'Cash' ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400'}`}>
            <Banknote size={16} /> Cash
          </button>
          <button onClick={() => setPaymentMethod('Online')} className={`py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-all tap-scale border ${paymentMethod === 'Online' ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400'}`}>
            <CreditCard size={16} /> Online
          </button>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
             <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
             <input type="text" inputMode="decimal" value={amountPaid} onChange={e => /^\d*\.?\d*$/.test(e.target.value) && setAmountPaid(e.target.value)} placeholder="0.00" className={`w-full py-4 pl-8 pr-4 rounded-xl border-2 focus:border-indigo-500 outline-none transition-all font-bold text-lg text-center ${paymentMethod === 'Online' ? 'bg-slate-100 dark:bg-white/5 border-transparent opacity-40' : 'bg-slate-50 dark:bg-slate-800 border-transparent'}`} readOnly={paymentMethod === 'Online'} />
          </div>
          <div className={`flex-1 rounded-xl flex flex-col justify-center items-center border border-dashed transition-all ${balance < 0 ? 'bg-red-50 dark:bg-red-900/10 border-red-200 text-red-600' : 'bg-green-50 dark:bg-green-900/10 border-green-200 text-green-600'}`}>
             <span className="text-[9px] font-black uppercase tracking-wider opacity-60">{balance < 0 ? 'Pay' : 'Change'}</span>
             <span className="text-lg font-black tabular-nums">{formatCurrency(Math.abs(balance))}</span>
          </div>
        </div>

        <button onClick={handleCheckout} disabled={cart.length === 0 || isSubmitting} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-glow tap-scale flex items-center justify-center gap-2 transition-colors">
          {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <><CheckCircle2 size={20} /> Checkout</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 transition-colors">
      
      {/* Navbar Desktop */}
      <nav className="hidden md:flex flex-none glass-card mx-6 mt-4 rounded-3xl px-8 py-4 items-center justify-between z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <UtensilsCrossed size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight leading-none">{APP_TITLE}</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{APP_SUBTITLE}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100/50 dark:bg-white/5 p-1 rounded-full border border-white/20 dark:border-white/5">
          <button onClick={() => { setActiveTab('menu'); setShowAdminPanel(false); }} className={`px-6 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all tap-scale ${activeTab === 'menu' && !showAdminPanel ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
             <LayoutGrid size={16} /> POS
          </button>
          <button onClick={() => { setActiveTab('history'); setShowAdminPanel(false); }} className={`px-6 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all tap-scale ${activeTab === 'history' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
             <HistoryIcon size={16} /> Journal
          </button>
          <div className="w-px h-6 bg-slate-200 dark:bg-white/10 mx-2" />
          <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 rounded-full text-slate-500 dark:text-white hover:bg-white/50 tap-scale">
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => isAdminLoggedIn ? setShowAdminPanel(true) : setShowLoginModal(true)} className={`p-2.5 rounded-full tap-scale transition-colors ${showAdminPanel ? 'bg-indigo-600 text-white shadow-glow' : 'text-slate-500 dark:text-white hover:bg-white/50'}`}>
            <Settings2 size={18} />
          </button>
          <div className={`p-2.5 rounded-full transition-colors ${isOnline ? 'text-green-500' : 'text-red-500 animate-pulse'}`}>
             {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
          </div>
        </div>
      </nav>

      {/* Mobile Header */}
      <header className="md:hidden flex-none px-6 py-5 flex items-center justify-between glass sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-md"><UtensilsCrossed size={20} /></div>
          <div>
            <h1 className="font-black text-lg tracking-tight uppercase leading-none">{APP_TITLE}</h1>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Terminal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full transition-all ${isOnline ? 'bg-green-500/10 text-green-500' : 'bg-red-500 text-white animate-pulse'}`}>
             {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
          </div>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 bg-slate-100 dark:bg-white/10 rounded-full tap-scale">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col md:flex-row overflow-hidden mt-0 md:mt-4">
        {showAdminPanel ? (
          <div className="flex-1 overflow-y-auto p-4 md:p-10 pb-32 animate-fade-in">
             <div className="max-w-6xl mx-auto space-y-8">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl p-8 rounded-[40px] border border-white/20 shadow-sm">
                   <div>
                      <h2 className="text-3xl font-black uppercase tracking-tight">Management Center</h2>
                      <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.4em] mt-2">Authorized Access Only</p>
                   </div>
                   <div className="flex gap-2">
                     {pendingOrders.length > 0 && (
                        <button disabled={!isOnline || isSyncing} onClick={syncPendingOrders} className="px-6 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-2xl tap-scale transition-colors hover:bg-indigo-100 flex items-center gap-2 font-bold text-xs uppercase tracking-wider disabled:opacity-50">
                           {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} 
                           Sync Offline ({pendingOrders.length})
                        </button>
                     )}
                     <button onClick={() => { setIsAdminLoggedIn(false); setShowAdminPanel(false); }} className="px-6 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-2xl tap-scale transition-colors hover:bg-red-100 flex items-center gap-2 font-bold text-xs uppercase tracking-wider"><LogOut size={16} /> Exit</button>
                   </div>
                </header>

                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                   {[
                     { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                     { id: 'assets', label: 'Inventory', icon: Package },
                     { id: 'branding', label: 'Branding', icon: Settings2 }
                   ].map(tab => (
                     <button key={tab.id} onClick={() => setAdminTab(tab.id as any)} className={`px-8 py-4 rounded-3xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap tap-scale transition-all flex items-center gap-3 border ${adminTab === tab.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-glow' : 'bg-white/40 dark:bg-slate-800/40 border-white/10 text-slate-400 hover:bg-white/60'}`}>
                        <tab.icon size={16} /> {tab.label}
                     </button>
                   ))}
                </div>

                {adminTab === 'analytics' && (
                  <div className="space-y-6 animate-scale-up">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-8 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[40px] text-white shadow-glow-lg relative overflow-hidden group border border-white/10">
                           <div className="absolute top-0 right-0 p-8 opacity-20 transform group-hover:scale-110 transition-transform"><TrendingUp size={80} /></div>
                           <span className="text-[10px] font-black uppercase tracking-widest opacity-70 flex items-center gap-2">Revenue Today</span>
                           <div className="text-5xl font-black mt-4 tracking-tighter tabular-nums">{formatCurrency(getAnalytics().revToday)}</div>
                           <div className="mt-8 flex items-center gap-2 text-[10px] font-bold bg-white/10 w-fit px-4 py-2 rounded-full backdrop-blur-md border border-white/10">
                              <Package size={14} /> {getAnalytics().countToday} Orders
                           </div>
                        </div>

                        <div className="p-8 bg-slate-900 dark:bg-slate-800 rounded-[40px] text-white border border-slate-800 dark:border-white/5 relative overflow-hidden shadow-xl">
                           <div className="absolute -bottom-10 -right-10 p-8 opacity-5"><DollarSign size={120} /></div>
                           <span className="text-[10px] font-black uppercase tracking-widest opacity-60 text-indigo-400">Lifetime Value</span>
                           <div className="text-4xl font-black mt-4 tracking-tighter tabular-nums">{formatCurrency(getAnalytics().revAllTime)}</div>
                           <div className="mt-8 text-[11px] font-bold text-slate-500">Total historical revenue</div>
                        </div>

                        <div className="p-8 bg-white dark:bg-slate-800/50 rounded-[40px] border border-white/20 shadow-sm flex flex-col justify-between backdrop-blur-sm">
                           <div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg. Order Value</span>
                              <div className="text-4xl font-black mt-4 tracking-tighter tabular-nums text-slate-900 dark:text-white">{formatCurrency(getAnalytics().avgOrderValue)}</div>
                           </div>
                           <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-full mt-6 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 w-[65%] rounded-full" />
                           </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-8 bg-white/60 dark:bg-slate-800/60 rounded-[40px] border border-white/20 backdrop-blur-sm shadow-sm">
                           <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-3 mb-6"><BarChart3 size={18} /> Top Performers</h4>
                           <div className="space-y-4">
                              {getAnalytics().topItems.map((item, idx) => (
                                <div key={idx} className="group">
                                   <div className="flex justify-between items-end mb-2">
                                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">{item.name}</span>
                                      <span className="text-[10px] font-black text-slate-400 tabular-nums">{item.count}</span>
                                   </div>
                                   <div className="w-full h-2.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                      <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${(item.count / getAnalytics().maxItemCount) * 100}%` }} />
                                   </div>
                                </div>
                              ))}
                           </div>
                        </div>

                        <div className="p-8 bg-white/60 dark:bg-slate-800/60 rounded-[40px] border border-white/20 backdrop-blur-sm shadow-sm">
                           <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-3 mb-6"><PieChart size={18} /> Categories</h4>
                           <div className="space-y-3">
                              {getAnalytics().categoryStats.map(([cat, count], idx) => (
                                 <div key={idx} className="flex items-center gap-4 p-3 bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-white/5">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10`}>
                                       {getCategoryIcon(cat)}
                                    </div>
                                    <div className="flex-1">
                                       <div className="flex justify-between mb-1">
                                          <span className="text-xs font-bold uppercase tracking-tight">{cat}</span>
                                          <span className="text-[10px] font-bold text-slate-400">{Math.round((count / getAnalytics().totalItemsSold) * 100)}%</span>
                                       </div>
                                       <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                          <div className="h-full bg-slate-800 dark:bg-white rounded-full" style={{ width: `${(count / getAnalytics().totalItemsSold) * 100}%` }} />
                                       </div>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     </div>
                  </div>
                )}

                {adminTab === 'assets' && (
                  <div className="space-y-6 animate-scale-up">
                     <div className="flex gap-4">
                        <button onClick={() => { setEditingItem(null); setItemForm({ name: '', price: 0, category: '', imageUrl: '' }); setIsItemModalOpen(true); }} className="flex-1 py-5 bg-indigo-600 text-white rounded-[28px] font-black text-xs uppercase tracking-widest shadow-glow tap-scale flex items-center justify-center gap-3 hover:bg-indigo-700 transition-colors">
                            <Plus size={18} strokeWidth={3} /> Add Product
                        </button>
                     </div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {menuItems.map(item => (
                          <div key={item.id} className="p-4 bg-white dark:bg-slate-800/50 rounded-[32px] border border-white/20 shadow-sm flex items-center gap-4 group hover:shadow-lg transition-all">
                             <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center text-slate-400 overflow-hidden">
                                {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : getCategoryIcon(item.category)}
                             </div>
                             <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm uppercase tracking-tight truncate">{item.name}</div>
                                <div className="text-xs font-black text-indigo-500 uppercase tracking-widest mt-1">{formatCurrency(item.price)}</div>
                             </div>
                             <div className="flex flex-col gap-2">
                                <button onClick={() => { setEditingItem(item); setItemForm(item); setIsItemModalOpen(true); }} className="p-2 bg-slate-50 dark:bg-white/5 rounded-xl tap-scale text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><PenSquare size={16} /></button>
                                <button onClick={() => { 
                                  if(confirm('Delete item?')) {
                                    remove(ref(db, `menu/${item.id}`));
                                  } 
                                }} className="p-2 bg-slate-50 dark:bg-white/5 rounded-xl tap-scale text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                )}

                {adminTab === 'branding' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-scale-up">
                     <div className="bg-white dark:bg-slate-800/50 rounded-[48px] border border-white/20 p-8 md:p-10 space-y-6 shadow-sm">
                        <div className="space-y-4">
                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Store Identity</label>
                              <div className="relative group">
                                <UtensilsCrossed className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                                <input type="text" placeholder="Business Name" value={receiptConfig.businessName} onChange={e => setReceiptConfig({...receiptConfig, businessName: e.target.value})} className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" />
                              </div>
                           </div>

                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Address & Contact</label>
                              <textarea placeholder="Store Address" value={receiptConfig.address} onChange={e => setReceiptConfig({...receiptConfig, address: e.target.value})} className="w-full p-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-medium text-xs h-24 resize-none" />
                              <input type="text" placeholder="Phone Number" value={receiptConfig.phone} onChange={e => setReceiptConfig({...receiptConfig, phone: e.target.value})} className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" />
                           </div>

                           <div className="space-y-3">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Typography Scaling</label>
                              <div className="flex p-1.5 bg-slate-100 dark:bg-slate-900/60 rounded-[20px] gap-1">
                                {(['small', 'medium', 'large'] as const).map(size => (
                                  <button key={size} onClick={() => setReceiptConfig({...receiptConfig, fontSize: size})} className={`flex-1 py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-all ${receiptConfig.fontSize === size ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-md' : 'text-slate-400'}`}>{size}</button>
                                ))}
                              </div>
                           </div>

                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Footer Message</label>
                              <input type="text" placeholder="Thank you message..." value={receiptConfig.footerMessage} onChange={e => setReceiptConfig({...receiptConfig, footerMessage: e.target.value})} className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm" />
                           </div>
                        </div>

                        <button onClick={() => { 
                          try {
                            localStorage.setItem('pos_receipt_config', JSON.stringify(receiptConfig)); 
                            showNotification('Branding Updated', 'success'); 
                          } catch (e) {
                            showNotification('Storage Limit Reached', 'error');
                          }
                        }} className="w-full py-5 bg-indigo-600 text-white rounded-[28px] font-black text-xs uppercase tracking-widest shadow-glow tap-scale flex items-center justify-center gap-2">
                          <Save size={18} /> Commit Changes
                        </button>
                     </div>

                     {/* Live Thermal Receipt Preview */}
                     <div className="flex flex-col items-center">
                        <div className="mb-6 flex items-center gap-2 px-6 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-100 dark:border-indigo-500/20 animate-pulse">
                          <Receipt className="animate-float" size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Thermal Output Preview</span>
                        </div>
                        
                        <div className="w-full max-w-[320px] bg-white text-slate-900 p-8 shadow-2xl rounded-sm font-mono border-t-8 border-slate-900 relative">
                           <div className="absolute -bottom-2 left-0 right-0 h-4 overflow-hidden flex">
                              {Array.from({length: 20}).map((_, i) => (
                                <div key={i} className="w-4 h-4 bg-white rotate-45 -translate-y-2 flex-shrink-0" />
                              ))}
                           </div>

                           <div className={`text-center space-y-1 mb-6 ${receiptConfig.fontSize === 'small' ? 'text-[10px]' : receiptConfig.fontSize === 'large' ? 'text-[14px]' : 'text-[12px]'}`}>
                              <h4 className="font-bold text-lg uppercase tracking-tighter leading-none mb-1">{receiptConfig.businessName || 'Business Name'}</h4>
                              <p className="opacity-70 text-[9px] leading-tight">{receiptConfig.address || 'Address Line'}</p>
                              <p className="opacity-70 text-[9px]">{receiptConfig.phone || 'Phone Number'}</p>
                           </div>

                           <div className="border-y border-dashed border-slate-300 py-3 mb-4 space-y-1 text-[10px] opacity-60">
                              <div className="flex justify-between items-center"><span className="flex items-center gap-1"><Hash size={10} /> ORDER: #123456</span> <span className="flex items-center gap-1"><Calendar size={10} /> 24 MAY, 08:45 PM</span></div>
                           </div>

                           <div className={`space-y-2 mb-6 ${receiptConfig.fontSize === 'small' ? 'text-[11px]' : receiptConfig.fontSize === 'large' ? 'text-[15px]' : 'text-[13px]'}`}>
                              <div className="flex justify-between"><span className="font-medium">2x Classic Snack</span> <span className="font-bold">₹40.00</span></div>
                              <div className="flex justify-between"><span className="font-medium">1x Special Tea</span> <span className="font-bold">₹15.00</span></div>
                           </div>

                           <div className="border-t border-slate-900 pt-4 space-y-1 mb-8">
                              <div className="flex justify-between items-end"><span className="text-[10px] font-bold uppercase opacity-50">Grand Total</span> <span className="text-xl font-black">₹55.00</span></div>
                              <div className="flex justify-between text-[10px] opacity-60"><span>Payment Method</span> <span>ONLINE</span></div>
                           </div>

                           <div className="text-center opacity-70 border-t border-dashed border-slate-300 pt-6 mt-4">
                              <p className="text-[9px] italic leading-tight">{receiptConfig.footerMessage || 'Thank you!'}</p>
                              <div className="mt-4 text-[8px] tracking-[0.3em] font-bold opacity-30">TERMINAL OUTPUT</div>
                           </div>
                        </div>
                     </div>
                  </div>
                )}
             </div>
          </div>
        ) : activeTab === 'menu' ? (
          <>
            <div className="flex-1 flex flex-col h-full md:mr-[380px] transition-colors">
              <div className="px-4 py-4 space-y-3 sticky top-0 z-20">
                <div className="relative group max-w-2xl mx-auto md:mx-0 w-full">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                  <input type="text" placeholder="Quick search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-12 pl-12 pr-6 rounded-[24px] bg-white/60 dark:bg-slate-800/60 backdrop-blur-md border border-white/20 dark:border-white/5 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 outline-none transition-all font-bold text-xs shadow-sm" />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap tap-scale transition-all border ${selectedCategory === cat ? 'bg-indigo-600 border-indigo-600 text-white shadow-glow' : 'bg-white/60 dark:bg-slate-800/60 border-white/20 text-slate-500 hover:bg-white'}`}>{cat}</button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-40 md:pb-10 scrollbar-hide">
                <div className="menu-grid">
                  {filteredItems.map(item => {
                    const inCart = cart.find(c => c.id === item.id);
                    const qty = inCart?.quantity || 0;
                    return (
                      <div key={item.id} onClick={() => !qty && updateQuantity(item.id, 1)} className={`relative group bg-white dark:bg-slate-800/60 backdrop-blur-sm rounded-[20px] md:rounded-[24px] p-3 md:p-4 border transition-all duration-300 cursor-pointer select-none flex flex-col justify-between h-full min-h-[110px] md:min-h-[140px] shadow-sm hover:shadow-lg hover:-translate-y-0.5 ${qty ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-white/40 dark:border-white/5'}`}>
                        <div className="flex justify-between items-start">
                           <div className="flex-1 min-w-0 pr-2">
                              <div className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-0.5 md:mb-2 opacity-80">{item.category}</div>
                              <h3 className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight mb-1 line-clamp-2">{item.name}</h3>
                           </div>
                           <div className="text-slate-300 dark:text-slate-600 flex-shrink-0">
                             {item.imageUrl ? (
                               <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl overflow-hidden shadow-sm">
                                 <img src={item.imageUrl} className="w-full h-full object-cover" />
                               </div>
                             ) : getCategoryIcon(item.category, 18)}
                           </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2 md:mt-4">
                            <span className="text-base md:text-lg font-black text-indigo-600 dark:text-indigo-400 tabular-nums">{formatCurrency(item.price)}</span>
                            {!qty && <button className="w-7 h-7 md:w-8 md:h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-glow transition-transform active:scale-90"><Plus size={14} md:size={16} strokeWidth={3} /></button>}
                        </div>

                        {qty > 0 && (
                          <div className="absolute inset-x-2 md:inset-x-3 bottom-2 md:bottom-3 z-10 animate-scale-up">
                            <div className="bg-indigo-600 h-9 md:h-10 rounded-[12px] md:rounded-[14px] flex items-center justify-between px-1 md:px-1.5 shadow-lg border border-white/20">
                              <button onClick={e => { e.stopPropagation(); updateQuantity(item.id, -1); }} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-white hover:bg-white/10 rounded-full tap-scale"><Minus size={12} md:size={14} strokeWidth={3} /></button>
                              <span className="text-white font-black text-[10px] md:text-xs tabular-nums">{qty}</span>
                              <button onClick={e => { e.stopPropagation(); updateQuantity(item.id, 1); }} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-white hover:bg-white/10 rounded-full tap-scale"><Plus size={12} md:size={14} strokeWidth={3} /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <aside className="hidden md:block w-[380px] fixed right-0 top-0 bottom-0 z-40">
              {renderCart()}
            </aside>

            {cart.length > 0 && !isMobileCartOpen && (
              <div className="md:hidden fixed bottom-[calc(6rem+env(safe-area-inset-bottom,20px))] left-4 right-4 z-40 animate-slide-up">
                <button onClick={() => setIsMobileCartOpen(true)} className="w-full h-16 bg-slate-900 dark:bg-indigo-600 text-white rounded-[24px] shadow-glow-lg p-4 flex items-center justify-between ring-1 ring-white/10 tap-scale">
                   <div className="flex items-center gap-3">
                     <div className="h-9 w-9 bg-white dark:bg-white/20 rounded-xl flex items-center justify-center text-slate-900 dark:text-white font-black text-xs tabular-nums shadow-sm">{cart.reduce((a,c) => a+c.quantity, 0)}</div>
                     <div className="flex flex-col items-start">
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-60 leading-none">Total</span>
                        <span className="text-lg font-black tracking-tighter">{formatCurrency(totalAmount)}</span>
                     </div>
                   </div>
                   <div className="h-9 px-4 bg-white/10 rounded-xl flex items-center gap-2 border border-white/10 text-[8px] font-black uppercase tracking-widest hover:bg-white/20 transition-colors">
                      <span>Review</span>
                      <ChevronRight size={12} strokeWidth={3} />
                   </div>
                </button>
              </div>
            )}

            {isMobileCartOpen && (
              <div className="md:hidden fixed inset-0 z-[100] flex justify-end bg-slate-950/60 backdrop-blur-sm animate-fade-in">
                <div className="absolute inset-0" onClick={() => setIsMobileCartOpen(false)} />
                <div className="relative w-full max-w-[90%] sm:max-w-[400px] h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-slide-in-right border-l border-white/10">
                   <div className="flex-1 overflow-hidden h-full">{renderCart(true)}</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col transition-colors pb-32 md:pb-0">
            <OrderHistory 
              receiptConfig={receiptConfig} 
              orders={allOrders} 
              onDelete={id => {
                const isLocal = pendingOrders.find(o => o.id === id);
                if (isLocal) {
                  const updated = pendingOrders.filter(o => o.id !== id);
                  setPendingOrders(updated);
                  localStorage.setItem('pos_pending_orders', JSON.stringify(updated));
                } else {
                  remove(ref(db, 'orders/' + id.replace('#', '')));
                }
              }} 
              onUpdate={u => set(ref(db, 'orders/' + u.id.replace('#', '')), u)} 
            />
          </div>
        )}
      </main>

      {isItemModalOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 md:p-6 bg-slate-950/80 backdrop-blur-xl animate-fade-in">
           <div className="bg-white dark:bg-slate-900 rounded-[40px] shadow-2xl w-full max-w-2xl max-h-[90dvh] overflow-hidden animate-scale-up border border-white/10 flex flex-col">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black tracking-tighter uppercase">{editingItem ? 'Refine Product' : 'Add New Product'}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configure Catalog Entry</p>
                </div>
                <button onClick={() => setIsItemModalOpen(false)} className="p-3 bg-slate-50 dark:bg-white/5 rounded-full text-slate-400 hover:text-red-500 transition-colors tap-scale">
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <div className="w-full aspect-square rounded-[32px] bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden relative group shadow-inner">
                          {isGeneratingImage ? (
                            <div className="flex flex-col items-center animate-pulse text-indigo-500">
                              <Loader2 className="animate-spin" size={32} />
                              <span className="text-[9px] font-black mt-3 uppercase tracking-widest">AI Synthesis...</span>
                            </div>
                          ) : itemForm.imageUrl ? (
                            <>
                              <img src={itemForm.imageUrl} className="w-full h-full object-cover animate-fade-in" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setItemForm({...itemForm, imageUrl: ''})} className="p-4 bg-red-500 text-white rounded-full shadow-lg tap-scale transition-transform hover:scale-110">
                                  <Trash2 size={24} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="text-slate-200 dark:text-slate-700">
                              {getCategoryIcon(itemForm.category, 64)}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                           <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                           <button onClick={() => fileInputRef.current?.click()} className="flex-1 min-w-[120px] py-3 bg-slate-100 dark:bg-white/5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors tap-scale">
                             <Upload size={14} /> Upload Local
                           </button>
                           <button onClick={handleAIGenerate} disabled={isGeneratingImage || !itemForm.name} className="flex-1 min-w-[120px] py-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors disabled:opacity-30 tap-scale border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                             <Sparkles size={14} /> AI Generate
                           </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 px-2"><Type size={12} /> Display Name</label>
                            <input type="text" value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} placeholder="e.g. Special Ghee Dosa" className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm shadow-sm transition-all dark:text-white" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 px-2"><Package size={12} /> Classification</label>
                            <input type="text" list="categories" value={itemForm.category} onInput={(e) => setItemForm({...itemForm, category: (e.target as HTMLInputElement).value})} placeholder="Select or type..." className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm shadow-sm transition-all dark:text-white" />
                            <datalist id="categories">{categories.filter(c=>c!=='All').map(c=><option key={c} value={c} />)}</datalist>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 px-2"><IndianRupee size={12} /> Rate Card (₹)</label>
                            <div className="relative">
                               <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">₹</span>
                               <input type="number" value={itemForm.price} onChange={e => setItemForm({...itemForm, price: parseFloat(e.target.value) || 0})} className="w-full pl-8 pr-4 py-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold text-sm shadow-sm transition-all dark:text-white" />
                            </div>
                        </div>
                    </div>
                 </div>
              </div>

              <div className="p-8 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5 flex gap-4">
                  <button onClick={() => setIsItemModalOpen(false)} className="flex-1 py-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 font-black text-[11px] uppercase tracking-widest text-slate-400 tap-scale transition-colors hover:bg-slate-50">Discard Changes</button>
                  <button onClick={async () => {
                    if(!itemForm.name || !itemForm.price) { showNotification('Name and Price are required', 'error'); return; }
                    const id = editingItem ? editingItem.id : Date.now();
                    const newItem = { ...itemForm, id } as MenuItem;
                    
                    try { 
                        await set(ref(db, `menu/${newItem.id}`), newItem);
                        setIsItemModalOpen(false); 
                        showNotification('Inventory Catalog Updated', 'success'); 
                    } catch (e) { 
                        showNotification('Cloud Sync Error', 'error'); 
                    }
                  }} className="flex-[1.5] py-4 rounded-2xl bg-indigo-600 text-white font-black text-[11px] uppercase tracking-widest shadow-glow tap-scale transition-transform hover:bg-indigo-700 flex items-center justify-center gap-2"><Cloud size={14} /> Commit to Cloud</button>
              </div>
           </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-6 left-6 right-6 h-20 glass bg-white/90 dark:bg-slate-900/90 rounded-[32px] flex items-center justify-center gap-12 pb-safe z-50 shadow-premium border border-white/20">
        <button onClick={() => { setActiveTab('menu'); setShowAdminPanel(false); }} className={`flex flex-col items-center gap-1 transition-all tap-scale ${activeTab === 'menu' && !showAdminPanel ? 'text-indigo-600 dark:text-indigo-400 -translate-y-1' : 'text-slate-400'}`}>
          <div className={`p-2.5 rounded-[18px] transition-all ${activeTab === 'menu' && !showAdminPanel ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}><UtensilsCrossed size={22} strokeWidth={activeTab === 'menu' ? 2.5 : 2} /></div>
        </button>
        <button onClick={() => { setActiveTab('history'); setShowAdminPanel(false); }} className={`flex flex-col items-center gap-1 transition-all tap-scale ${activeTab === 'history' ? 'text-indigo-600 dark:text-indigo-400 -translate-y-1' : 'text-slate-400'}`}>
          <div className={`p-2.5 rounded-[18px] transition-all ${activeTab === 'history' ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}><HistoryIcon size={22} strokeWidth={activeTab === 'history' ? 2.5 : 2} /></div>
        </button>
        <button onClick={() => isAdminLoggedIn ? setShowAdminPanel(true) : setShowLoginModal(true)} className={`flex flex-col items-center gap-1 transition-all tap-scale ${showAdminPanel ? 'text-indigo-600 -translate-y-1' : 'text-slate-400'}`}>
          <div className={`p-2.5 rounded-[18px] transition-all ${isAdminLoggedIn ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}>{isAdminLoggedIn ? <UserCircle size={22} className="text-indigo-600" /> : <Lock size={22} />}</div>
        </button>
      </nav>

      {showLoginModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-[48px] shadow-2xl w-full max-sm p-10 animate-scale-up border border-white/10 text-center relative overflow-hidden">
            <div className="w-20 h-20 bg-indigo-600 rounded-[30px] mx-auto flex items-center justify-center text-white mb-6 shadow-glow"><Lock size={32} strokeWidth={2.5} /></div>
            <h3 className="text-2xl font-black tracking-tighter uppercase mb-1">Authorization</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">Admin Key Required</p>
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <input type="text" placeholder="Identity" className="w-full p-4 rounded-[20px] bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 outline-none font-bold transition-all text-sm shadow-inner" onChange={e => setLoginForm({...loginForm, username: e.target.value})} />
              <input type="password" placeholder="Keycode" className="w-full p-4 rounded-[20px] bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 outline-none font-bold transition-all text-sm shadow-inner" onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowLoginModal(false)} className="flex-1 py-4 rounded-[24px] bg-slate-100 dark:bg-white/5 font-bold text-slate-400 uppercase text-[10px] tap-scale">Dismiss</button>
                <button type="submit" className="flex-1 py-4 rounded-[24px] bg-indigo-600 text-white font-bold uppercase text-[10px] tap-scale shadow-glow">Unlock</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-32 md:bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 rounded-full shadow-2xl z-[300] flex items-center gap-3 animate-slide-up glass border border-white/20 ${toast.type === 'success' ? 'bg-indigo-600/90 text-white' : 'bg-red-600/90 text-white'}`}>
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shadow-inner">{toast.type === 'success' ? <CheckCircle2 size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}</div>
          <span className="text-[10px] font-black uppercase tracking-widest">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
