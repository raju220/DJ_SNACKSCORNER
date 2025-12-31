
import React, { useState, useRef } from 'react';
import { Order, PaymentMethod, ReceiptConfig } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { ChevronDown, Search, Calendar, FileText, Trash2, Edit2, Printer, History as HistoryIcon, CreditCard, Banknote, X, Receipt, CloudOff, RefreshCw } from 'lucide-react';

interface OrderHistoryProps {
  orders: Order[];
  receiptConfig: ReceiptConfig;
  onDelete: (id: string) => void;
  onUpdate: (order: Order) => void;
}

const SwipeableOrder: React.FC<{ children: React.ReactNode; onDelete: () => void }> = ({ children, onDelete }) => {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; setIsDragging(true); };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const diff = e.touches[0].clientX - startX.current;
    if (diff < 0) setTranslateX(diff);
  };
  const onTouchEnd = () => {
    if (translateX < -100) onDelete();
    setTranslateX(0); setIsDragging(false); startX.current = null;
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] group shadow-sm bg-red-500">
       <div className="absolute inset-y-0 right-0 flex items-center justify-end px-8 text-white font-black text-xs uppercase tracking-widest gap-2">
         <span>Delete</span> <Trash2 size={20} />
       </div>
       <div 
         className="relative z-10 transition-transform duration-300 ease-out bg-transparent"
         style={{ transform: `translateX(${translateX}px)`, transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
         onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
       >
         {children}
       </div>
    </div>
  );
};

export const OrderHistory: React.FC<OrderHistoryProps> = ({ orders, receiptConfig, onDelete, onUpdate }) => {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredOrders = orders.filter(o => {
    const orderDate = new Date(o.date);
    const matchesSearch = o.id.includes(searchTerm) || formatDate(o.date).toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesDate = true;
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && orderDate >= start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && orderDate <= end;
    }

    return matchesSearch && matchesDate;
  });

  const handlePrint = (order: Order) => {
    const dateObj = new Date(order.date);
    const dateStr = dateObj.toLocaleDateString('en-IN');
    const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const changeDue = Math.max(0, order.amountPaid - order.totalAmount);

    const receiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt ${order.id}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          body { 
            font-family: 'Courier New', monospace; 
            width: 72mm; 
            margin: 0 auto; 
            padding: 4mm; 
            background: #fff; 
            color: #000;
            font-size: 12px;
            line-height: 1.2;
          }
          .header { text-align: center; margin-bottom: 10px; }
          .brand { font-size: 16px; font-weight: bold; display: block; margin-bottom: 2px; text-transform: uppercase; }
          .addr { font-size: 10px; margin-bottom: 2px; }
          .meta { border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; font-size: 10px; }
          .flex-row { display: flex; justify-content: space-between; }
          .divider { border-top: 1px dashed #000; margin: 5px 0; }
          .item-row { display: flex; margin-bottom: 2px; font-size: 11px; }
          .qty { width: 20px; font-weight: bold; flex-shrink: 0; }
          .name { flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 5px; }
          .price { text-align: right; white-space: nowrap; }
          .totals { margin-top: 5px; }
          .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 5px; border-top: 1px solid #000; padding-top: 5px; }
          .footer { text-align: center; margin-top: 10px; font-size: 10px; }
          .barcode { text-align: center; margin-top: 10px; font-size: 10px; letter-spacing: 2px; }
        </style>
      </head>
      <body>
        <div class="header">
          <span class="brand">${receiptConfig.businessName}</span>
          <div class="addr">${receiptConfig.address}</div>
          <div class="addr">${receiptConfig.phone}</div>
        </div>
        
        <div class="meta">
          <div class="flex-row"><span>${dateStr}</span> <span>${timeStr}</span></div>
          <div class="flex-row"><span>Order: ${order.id}</span></div>
        </div>

        <div class="items">
          ${order.items.map(item => `
            <div class="item-row">
              <span class="qty">${item.quantity}</span>
              <span class="name">${item.name}</span>
              <span class="price">${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          `).join('')}
        </div>

        <div class="divider"></div>

        <div class="totals">
          <div class="flex-row"><span>Subtotal</span> <span>${order.totalAmount.toFixed(2)}</span></div>
          <div class="flex-row"><span>Pay (${order.paymentMethod})</span> <span>${order.amountPaid.toFixed(2)}</span></div>
          ${order.paymentMethod === 'Cash' ? `<div class="flex-row"><span>Change</span> <span>${changeDue.toFixed(2)}</span></div>` : ''}
          <div class="total-row">
            <span>TOTAL</span>
            <span>₹${order.totalAmount.toFixed(2)}</span>
          </div>
        </div>

        <div class="footer">
          ${receiptConfig.footerMessage}
        </div>
        <div class="barcode">
          *${order.id.replace('#', '')}*
        </div>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-10000px'; 
    iframe.style.top = '0';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(receiptHtml);
      doc.close();
      
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          try {
              iframe.contentWindow?.print();
          } catch (e) {
              console.error("Printing failed", e);
          }
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
        }, 100);
      };
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent transition-colors">
      <div className="flex-none p-6 md:p-8 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md md:rounded-[40px] md:mx-6 md:mt-4 md:border border-white/20 shadow-sm z-10 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-5">
             <div className="w-14 h-14 bg-white dark:bg-white/5 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-100 dark:border-white/5"><HistoryIcon size={24} strokeWidth={2.5} /></div>
             <div>
                <h2 className="text-2xl font-black uppercase tracking-tight leading-none">Journal</h2>
                <div className="flex items-center gap-2 mt-1">
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredOrders.length} Entries</span>
                </div>
             </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
             <div className="relative flex-1 sm:w-64 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input type="text" placeholder="Trace ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full h-12 pl-12 pr-4 rounded-[20px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 focus:border-indigo-500 outline-none font-bold text-xs shadow-sm transition-all" />
             </div>

             <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-slate-900 rounded-[22px] border border-slate-200 dark:border-white/10 shadow-sm">
                <div className="relative group">
                   <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                   <input 
                      type="date" 
                      value={startDate} 
                      onChange={e => setStartDate(e.target.value)}
                      className="pl-9 pr-2 py-2 bg-transparent outline-none font-bold text-[10px] w-28 text-slate-700 dark:text-slate-200"
                   />
                </div>
                <div className="w-px h-5 bg-slate-200 dark:bg-white/10" />
                <div className="relative group">
                   <input 
                      type="date" 
                      value={endDate} 
                      onChange={e => setEndDate(e.target.value)}
                      className="pl-3 pr-2 py-2 bg-transparent outline-none font-bold text-[10px] w-24 text-slate-700 dark:text-slate-200"
                   />
                </div>
                {(startDate || endDate) && (
                   <button onClick={() => {setStartDate(''); setEndDate('');}} className="p-1.5 bg-slate-100 dark:bg-white/10 text-slate-500 rounded-full hover:bg-red-500 hover:text-white transition-colors mr-1">
                      <X size={12} />
                   </button>
                )}
             </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-10 py-6 pb-40 md:pb-10 scrollbar-hide overscroll-contain">
        <div className="max-w-4xl mx-auto space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 opacity-30">
              <FileText size={64} className="mb-4 text-slate-400" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">No records found</span>
            </div>
          ) : (
            filteredOrders.map(order => (
               <SwipeableOrder key={order.id} onDelete={() => onDelete(order.id)}>
                  <div className={`bg-white dark:bg-slate-800/80 border backdrop-blur-sm rounded-[32px] overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md ${expandedOrderId === order.id ? 'border-indigo-500 ring-2 ring-indigo-500/10' : 'border-white/40 dark:border-white/5'}`}>
                    <div className="p-6 cursor-pointer tap-scale" onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}>
                       <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                              <span className="font-black text-[10px] text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 px-3 py-1.5 rounded-xl uppercase tracking-widest border border-indigo-100 dark:border-indigo-500/20">{order.id}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{formatDate(order.date)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {order.syncStatus === 'pending' && (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 border border-amber-100 dark:border-amber-900/30 text-[9px] font-black uppercase tracking-widest animate-pulse">
                                <CloudOff size={10} /> Local
                              </div>
                            )}
                            <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${order.amountPaid >= order.totalAmount ? 'bg-green-50 dark:bg-green-900/20 text-green-600 border-green-100 dark:border-green-900/30' : 'bg-red-50 text-red-600 border-red-100'}`}>
                              {order.amountPaid >= order.totalAmount ? 'Settled' : 'Unpaid'}
                            </div>
                          </div>
                       </div>
                       
                       <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                             <div className="p-2.5 bg-slate-50 dark:bg-white/5 rounded-[14px]">{order.paymentMethod === 'Online' ? <CreditCard size={18} className="text-indigo-500" /> : <Banknote size={18} className="text-green-500" />}</div>
                             <span>{order.paymentMethod}</span>
                          </div>
                          <div className="flex items-center gap-4">
                             <div className="text-right">
                                <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">{formatCurrency(order.totalAmount)}</div>
                             </div>
                             <div className={`p-2 bg-slate-50 dark:bg-white/5 rounded-full text-slate-400 transition-transform duration-300 ${expandedOrderId === order.id ? 'rotate-180 bg-indigo-50 text-indigo-600' : ''}`}><ChevronDown size={20} /></div>
                          </div>
                       </div>
                    </div>

                    {expandedOrderId === order.id && (
                      <div className="px-6 pb-6 pt-2 animate-fade-in bg-slate-50/50 dark:bg-white/5 border-t border-dashed border-slate-200 dark:border-white/10">
                         <div className="space-y-3 mb-6">
                           <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2"><Receipt size={14} /> Bill Details</h4>
                           {order.items.map((i,idx) => (
                             <div key={idx} className="flex justify-between text-xs items-center">
                                <span className="text-slate-700 dark:text-slate-300 font-medium flex items-center gap-2">
                                    <span className="text-slate-400 font-bold text-[10px] w-6 text-right tabular-nums">{i.quantity} x</span>
                                    {i.name}
                                </span>
                                <span className="font-bold tabular-nums text-slate-900 dark:text-white">{formatCurrency(i.price * i.quantity)}</span>
                             </div>
                           ))}
                         </div>
                         <div className="flex gap-3">
                            <button onClick={() => handlePrint(order)} className="flex-1 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[20px] flex items-center justify-center gap-2 tap-scale font-black text-[10px] uppercase tracking-widest shadow-lg transition-colors">
                              <Printer size={16} /> Print
                            </button>
                            <button onClick={() => onDelete(order.id)} className="p-3 bg-white dark:bg-slate-800 text-red-500 border border-red-100 dark:border-red-900/30 rounded-[20px] tap-scale hover:bg-red-50 transition-colors"><Trash2 size={16} /></button>
                         </div>
                      </div>
                    )}
                  </div>
               </SwipeableOrder>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
