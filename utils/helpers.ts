export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const generateOrderId = (): string => {
  return '#' + Math.floor(100000 + Math.random() * 900000).toString();
};

export const formatDate = (isoString: string): string => {
  return new Date(isoString).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};