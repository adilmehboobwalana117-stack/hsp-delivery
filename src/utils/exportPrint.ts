import { Order } from '../types';
import { formatPkr } from '../data/pakistanData';

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | undefined | null>>
): void {
  const escapeCell = (val: string | number | undefined | null) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\n');
  downloadFile(filename, csv, 'text/csv;charset=utf-8;');
}

export function downloadOrderReceipt(order: Order): void {
  const dateStr = new Date(order.createdAt).toLocaleString('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const itemLines = order.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #27272a;">${item.quantity}x ${item.name}</td>
          <td style="padding:8px 0;border-bottom:1px solid #27272a;text-align:right;font-family:monospace;">${formatPkr(
            item.pricePkr * item.quantity
          )}</td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>HSP delivery Receipt - ${order.orderCode}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #07070a; color: #f8fafc; margin: 28px auto; max-width: 520px; padding: 24px; border: 1px solid #d4af37; border-radius: 14px; }
    h1 { margin: 0; font-size: 20px; color: #facc15; }
    .muted { color: #a1a1aa; font-size: 12px; margin-top: 4px; }
    .meta { margin: 16px 0; padding: 12px; background: #12121a; border: 1px solid #27272a; border-radius: 10px; font-size: 13px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
    .totals { margin-top: 12px; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; margin: 4px 0; }
    .grand { font-size: 16px; font-weight: 800; color: #facc15; border-top: 2px solid #d4af37; padding-top: 8px; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>HSP delivery — Official Order Receipt</h1>
  <div class="muted">Order ${order.orderCode} · ${dateStr}</div>
  <div class="meta">
    <div><strong>Store / Business:</strong> ${order.restaurantName} (${order.city})</div>
    <div><strong>Customer:</strong> ${order.customerName} (${order.customerPhone})</div>
    <div><strong>Delivery Address:</strong> ${order.deliveryAddress}</div>
    ${order.distanceKm ? `<div><strong>Distance:</strong> ${order.distanceKm.toFixed(1)} km</div>` : ''}
    <div><strong>Payment:</strong> ${order.paymentMethod}${order.paymentRef ? ` (${order.paymentRef})` : ''} · Status: ${order.status.replace(/_/g, ' ').toUpperCase()}</div>
    ${order.riderName ? `<div><strong>Rider:</strong> ${order.riderName}</div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #d4af37;color:#fde047;">Item</th>
        <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #d4af37;color:#fde047;">Amount</th>
      </tr>
    </thead>
    <tbody>${itemLines}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${formatPkr(order.subtotalPkr)}</span></div>
    <div><span>Delivery Fee</span><span>${formatPkr(order.deliveryFeePkr)}</span></div>
    ${order.tipPkr ? `<div><span>Rider Tip</span><span>${formatPkr(order.tipPkr)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span>${formatPkr(order.totalPkr)}</span></div>
  </div>
  <p class="muted" style="margin-top:18px;text-align:center;">Thank you for choosing HSP delivery · Hasilpur & Pakistan</p>
</body>
</html>`;

  downloadFile(`hsp-delivery-receipt-${order.orderCode}.html`, html, 'text/html;charset=utf-8;');
}

export function triggerPrintWithTitle(docTitle?: string): void {
  const prevTitle = document.title;
  if (docTitle) {
    document.title = docTitle;
  }
  window.print();
  if (docTitle) {
    window.setTimeout(() => {
      document.title = prevTitle;
    }, 500);
  }
}
