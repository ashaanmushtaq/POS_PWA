import { useEffect } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { OfflineSalePayload } from '../lib/offlineQueue';
import './InvoicePrintModal.css';

interface InvoicePrintModalProps {
  sale: OfflineSalePayload;
  onClose: () => void;
}

export function InvoicePrintModal({ sale, onClose }: InvoicePrintModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleTriggerBrowserPrint() {
    window.print();
  }

  // =========================================================================
  // EXTENSION POINT: ESC/POS Thermal Printer Direct Output
  // =========================================================================
  // To connect a physical USB/Bluetooth/Serial thermal receipt printer:
  // 1. Request port: await navigator.serial.requestPort() or navigator.usb.requestDevice()
  // 2. Generate ESC/POS byte sequence:
  //    const ESC = 0x1B, GS = 0x1D;
  //    const init = new Uint8Array([ESC, 0x40]); // Initialize
  //    const boldOn = new Uint8Array([ESC, 0x45, 0x01]);
  //    const cut = new Uint8Array([GS, 0x56, 0x41, 0x00]); // Full Cut
  // 3. Write Uint8Array payload to printer writer stream:
  //    const writer = port.writable.getWriter();
  //    await writer.write(payload);
  // =========================================================================
  function handleEscPosThermalPrintExtension() {
    alert('ESC/POS Thermal Printer Extension Point: Ready for WebUSB/Serial device binding.');
  }

  async function domToPngBlob(node: HTMLElement): Promise<Blob> {
    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    } catch (err) {
      console.warn('html2canvas scale 2 failed, retrying scale 1:', err);
      canvas = await html2canvas(node, { scale: 1, useCORS: true, backgroundColor: '#ffffff', logging: false });
    }
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b: Blob | null) => { if (b) res(b); else rej(new Error('Failed to create blob')); }, 'image/png'));
  }

  async function generateImageBlob(node: HTMLElement): Promise<Blob> {
    if (node.offsetParent === null && node.clientHeight === 0 && node.clientWidth === 0) {
      throw new Error('Invoice element not visible for rendering');
    }
    return await domToPngBlob(node);
  }

  async function generatePdfBlob(node: HTMLElement): Promise<Blob> {
    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    } catch (err) {
      console.warn('html2canvas scale 2 failed for PDF, retrying scale 1:', err);
      canvas = await html2canvas(node, { scale: 1, useCORS: true, backgroundColor: '#ffffff', logging: false });
    }
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth - 40;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let top = 20;
    pdf.addImage(imgData, 'PNG', 20, top, imgWidth, imgHeight);

    let remainingHeight = imgHeight - (pageHeight - 40);
    while (remainingHeight > 0) {
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 20, 20, imgWidth, imgHeight);
      remainingHeight -= (pageHeight - 40);
    }

    return pdf.output('blob');
  }

  async function shareFile(file: File) {
    if (typeof (navigator as any).canShare === 'function' && (navigator as any).canShare({ files: [file] }) && typeof (navigator as any).share === 'function') {
      try {
        await (navigator as any).share({ files: [file], title: file.name, text: file.name });
        return { shared: true };
      } catch (err) {
        console.warn('navigator.share failed', err);
        return { shared: false, error: err };
      }
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { shared: false, fallbackDownloaded: true };
  }

  async function handleShareAsImage() {
    const node = document.getElementById('printable-invoice');
    if (!node) { alert('Invoice element not found'); return; }
    try {
      const blob = await generateImageBlob(node as HTMLElement);
      const file = new File([blob], `invoice-${sale.invoice_no}.png`, { type: 'image/png' });
      const res = await shareFile(file);
      if (!res.shared && res.fallbackDownloaded) {
        alert('This device/browser does not support direct file sharing. The invoice image has been downloaded — attach it manually to WhatsApp.');
      }
    } catch (err) {
      console.error('Image generation failed:', err);
      alert('Failed to generate invoice image on this device. Please try on a mobile browser (Android Chrome recommended).');
    }
  }

  async function handleShareAsPdf() {
    const node = document.getElementById('printable-invoice');
    if (!node) { alert('Invoice element not found'); return; }
    try {
      const blob = await generatePdfBlob(node as HTMLElement);
      const file = new File([blob], `invoice-${sale.invoice_no}.pdf`, { type: 'application/pdf' });
      const res = await shareFile(file);
      if (!res.shared && res.fallbackDownloaded) {
        alert('This device/browser does not support direct file sharing. The invoice PDF has been downloaded — attach it manually to WhatsApp.');
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate invoice PDF on this device. Please try on a mobile browser (Android Chrome recommended).');
    }
  }

  function handleShareWhatsAppText() {
    const itemLines = sale.items.map(i => `• ${i.quantity}x ${i.product_name} (${i.suit_type}) @ Rs.${i.unit_price.toLocaleString()} = Rs.${i.total_price.toLocaleString()}`).join('\n');
    const remaining = Math.max(0, sale.total_amount - sale.amount_paid);
    
    const textMsg = `*UB COLLECTION - WHOLESALE INVOICE*
Invoice #: ${sale.invoice_no}
Customer: ${sale.customer_name}${sale.shop_name ? ` (${sale.shop_name})` : ''}
Date: ${new Date(sale.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}

*ITEMS:*
${itemLines}

*TOTAL AMOUNT:* Rs. ${sale.total_amount.toLocaleString()}
*AMOUNT PAID:* Rs. ${sale.amount_paid.toLocaleString()}
*BALANCE DUE:* Rs. ${remaining.toLocaleString()}

_Thank you for your business with UB Collection!_`;

    if (navigator.share) {
      navigator.share({ title: `Invoice #${sale.invoice_no}`, text: textMsg }).catch(() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg)}`, '_blank');
      });
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg)}`, '_blank');
    }
  }

  const remainingBalance = Math.max(0, sale.total_amount - sale.amount_paid);

  return (
    <div className="inv-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="inv-modal-box">
        {/* Action bar (hidden during print) */}
        <div className="inv-action-bar no-print">
          <button id="btn-print-browser" className="inv-btn inv-btn--primary" onClick={handleTriggerBrowserPrint}>
            🖨️ Print Invoice
          </button>
          <button id="btn-share-whatsapp" className="inv-btn inv-btn--whatsapp" onClick={handleShareWhatsAppText}>
            💬 WhatsApp Text
          </button>
          <button id="btn-share-image" className="inv-btn inv-btn--secondary" onClick={handleShareAsImage}>
            📷 Share Image
          </button>
          <button id="btn-share-pdf" className="inv-btn inv-btn--secondary" onClick={handleShareAsPdf}>
            📄 Share PDF
          </button>
          <button id="btn-print-thermal" className="inv-btn inv-btn--secondary" onClick={handleEscPosThermalPrintExtension}>
            🧾 ESC/POS
          </button>
          <button className="inv-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Print-Ready Invoice Printable Sheet */}
        <div className="inv-sheet" id="printable-invoice">
          <div className="inv-header">
            <div>
              <h1 className="inv-company-name">UB COLLECTION</h1>
              <div className="inv-company-tagline">Gents Suits Wholesale & Garments Manufacturing</div>
              <div className="inv-company-contact">Main Cloth Market, Wholesale Hub · Tel: +92 300 1234567</div>
            </div>
            <div className="inv-header-meta">
              <div className="inv-invoice-badge">WHOLESALE INVOICE</div>
              <div className="inv-inv-num">#{sale.invoice_no}</div>
              <div className="inv-inv-date">Date: {new Date(sale.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
            </div>
          </div>

          <div className="inv-divider" />

          {/* Customer & Payment Info */}
          <div className="inv-info-row">
            <div className="inv-info-box">
                <div className="inv-info-label">Customer Details</div>
                <div className="inv-info-val"><strong>{sale.customer_name}</strong></div>
                {sale.shop_name && <div style={{ fontWeight: 600 }}>{sale.shop_name}</div>}
                {sale.customer_address && <div className="inv-info-sub">{sale.customer_address}</div>}
                {!sale.shop_name && !sale.customer_address && <div className="inv-info-sub">Wholesale Account</div>}
              </div>
            <div className="inv-info-box">
              <div className="inv-info-label">Payment Status & Method</div>
              <div className="inv-info-val">
                Method: <strong>{sale.payment_method.toUpperCase()}</strong>
              </div>
              {sale.due_date && (
                <div className="inv-info-sub">Payment Due Date: {sale.due_date}</div>
              )}
            </div>
          </div>

          {/* Itemized Table */}
          <table className="inv-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Suit / Product Item</th>
                <th>Type</th>
                <th className="inv-num">Qty</th>
                <th className="inv-num">Charged Rate</th>
                <th className="inv-num">Discount %</th>
                <th className="inv-num">Total Price (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, idx) => {
                const base = item.base_price ?? item.unit_price;
                const discPct = item.discount_percent ?? (base > item.unit_price ? Number((((base - item.unit_price) / base) * 100).toFixed(1)) : 0);

                return (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td><strong>{item.product_name}</strong></td>
                    <td>{item.suit_type}</td>
                    <td className="inv-num">{item.quantity}</td>
                    <td className="inv-num">
                      ₨{item.unit_price.toLocaleString()}
                      {base > item.unit_price && (
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          Base: ₨{base.toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="inv-num">
                      {discPct > 0 ? (
                        <span style={{
                          display: 'inline-block',
                          background: '#fef3c7',
                          color: '#92400e',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          {discPct.toFixed(1)}% OFF
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>0%</span>
                      )}
                    </td>
                    <td className="inv-num"><strong>₨{item.total_price.toLocaleString()}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Summary Totals */}
          <div className="inv-summary-row">
            <div className="inv-terms-box">
              <div className="inv-terms-title">Terms & Conditions</div>
              <p>1. Goods once sold are not returnable without authorization.</p>
              <p>2. Dues must be settled on or before agreed credit due date.</p>
              <p>3. Computer generated invoice — valid without physical signature.</p>
            </div>

            <div className="inv-totals-box">
              <div className="inv-total-line">
                <span>Total Amount:</span>
                <strong>₨{sale.total_amount.toLocaleString()}</strong>
              </div>
              <div className="inv-total-line inv-total-line--green">
                <span>Amount Paid Received:</span>
                <strong>₨{sale.amount_paid.toLocaleString()}</strong>
              </div>
              <div className="inv-total-line inv-total-line--due">
                <span>Remaining Balance Due:</span>
                <strong>₨{remainingBalance.toLocaleString()}</strong>
              </div>
            </div>
          </div>

          <div className="inv-footer">
            Thank you for your business with UB Collection!
          </div>
        </div>
      </div>
    </div>
  );
}
