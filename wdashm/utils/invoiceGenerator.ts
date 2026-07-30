import { Order, Restaurant } from '../types';
import { formatDualPrice } from './format';

/**
 * Generates an official, beautifully styled PDF/Printable invoice for a customer order
 * without any external third-party payment provider branding (e.g., KPay).
 */
export function generateOrderInvoiceHTML(order: Order, restaurant?: Restaurant): string {
  const restoName = restaurant?.name || (order.restaurant as any)?.name || 'Établissement Partenaire DashMeals';
  const restoPhone = restaurant?.phoneNumber || (order.restaurant as any)?.phoneNumber || (order.restaurant as any)?.phone_number || '';
  const restoAddress = (restaurant as any)?.address || (order.restaurant as any)?.address || `${restaurant?.city || 'Kinshasa'}, RDC`;

  const invoiceNum = `DM-INV-${order.id.slice(0, 8).toUpperCase()}`;
  const orderDate = order.createdAt 
    ? new Date(order.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const currencyMode = restaurant?.displayCurrencyMode || (order.restaurant as any)?.displayCurrencyMode || 'dual';
  const currency = (restaurant?.currency || (order.restaurant as any)?.currency || 'USD') as 'USD' | 'CDF';
  const exchangeRate = order.exchangeRate || restaurant?.exchangeRate || 2850;

  const isTakeaway = (order as any).delivery_fee === 0 || 
    (order.items && (order.items[0] as any)?.fulfillmentMode === 'pickup') || 
    order.deliveryLocation?.address?.includes('Récupération') || 
    order.deliveryLocation?.address?.includes('emporter');

  const deliveryAddress = isTakeaway 
    ? '🥡 À emporter (Récupération directe sur place)' 
    : (order.deliveryLocation?.address || 'Adresse de livraison fournie à la commande');

  let paymentMethodLabel = 'DashMeals Pay';
  if (order.paymentMethod === 'cash') {
    paymentMethodLabel = 'Paiement à la livraison (Cash)';
  } else if (order.paymentMethod === 'money_fusion') {
    paymentMethodLabel = 'Money Fusion';
  } else if (order.paymentNetwork) {
    paymentMethodLabel = `Mobile Money (${order.paymentNetwork.toUpperCase()})`;
  } else if (order.paymentMethod === 'kpay') {
    paymentMethodLabel = 'DashMeals Pay (Mobile Money)';
  }

  const paymentStatusLabel = order.paymentStatus === 'paid' ? 'PAYÉ ✅' : order.paymentStatus === 'failed' ? 'ÉCHOUÉ ❌' : 'EN ATTENTE ⏳';
  const paymentStatusColor = order.paymentStatus === 'paid' ? '#15803d' : order.paymentStatus === 'failed' ? '#b91c1c' : '#b45309';

  const itemsHtml = (order.items || []).map((item, idx) => {
    const qty = item.quantity || 1;
    const unitPrice = item.price || 0;
    const lineTotal = unitPrice * qty;
    const itemNotes = (item as any).notes || '';
    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px 16px; font-size: 13px; color: #1e293b;">
          <strong>${idx + 1}. ${item.name || 'Article'}</strong>
          ${itemNotes ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 2px;">Note: ${itemNotes}</div>` : ''}
        </td>
        <td align="center" style="padding: 12px 16px; font-size: 13px; color: #475569; font-weight: bold;">
          x${qty}
        </td>
        <td align="right" style="padding: 12px 16px; font-size: 13px; color: #475569; font-family: monospace;">
          ${formatDualPrice(unitPrice, currency, exchangeRate, currencyMode)}
        </td>
        <td align="right" style="padding: 12px 16px; font-size: 13px; font-weight: 800; color: #0f172a; font-family: monospace;">
          ${formatDualPrice(lineTotal, currency, exchangeRate, currencyMode)}
        </td>
      </tr>
    `;
  }).join('');

  const deliveryFee = (order as any).delivery_fee || (order as any).deliveryFee || 0;
  const totalAmount = order.totalAmount || 0;
  const subtotal = Math.max(0, totalAmount - deliveryFee);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Facture ${invoiceNum} - DashMeals</title>
  <style>
    @media print {
      body { margin: 0; padding: 0; background: #fff; }
      .no-print { display: none !important; }
      .page-card { border: none !important; box-shadow: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 24px;
    }
    .page-card {
      max-width: 760px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 25px rgba(0,0,0,0.05);
      overflow: hidden;
    }
    .btn-print {
      background-color: #ea580c;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-print:hover {
      background-color: #c2410c;
    }
  </style>
</head>
<body>

  <div class="no-print" style="max-width: 760px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center;">
    <div style="font-size: 13px; color: #64748b; font-weight: 600;">
      📄 Facture client officielle DashMeals
    </div>
    <button onclick="window.print()" class="btn-print">
      🖨️ Télécharger / Imprimer la Facture PDF
    </button>
  </div>

  <div class="page-card">
    <!-- Header Banner -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px; color: #ffffff;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td valign="top">
            <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff;">
              DashMeals <span style="color: #ea580c;">Pay</span>
            </h1>
            <p style="margin: 6px 0 0 0; font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
              Reçu Officiel & Facture Client
            </p>
          </td>
          <td align="right" valign="top">
            <span style="display: inline-block; background-color: rgba(255,255,255,0.1); color: #ffffff; border: 1px solid rgba(255,255,255,0.2); font-size: 11px; font-weight: 900; text-transform: uppercase; padding: 6px 14px; border-radius: 50px; letter-spacing: 0.5px;">
              Facture Client
            </span>
            <p style="margin: 10px 0 0 0; font-size: 13px; font-family: monospace; font-weight: 700; color: #fdba74;">
              ${invoiceNum}
            </p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Details Metadata Header -->
    <div style="padding: 24px 32px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td width="50%" valign="top">
            <p style="margin: 0; font-size: 10px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 0.5px;">Établissement / Restaurant</p>
            <p style="margin: 4px 0 0 0; font-size: 15px; font-weight: 800; color: #0f172a;">${restoName}</p>
            ${restoAddress ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #475569;">📍 ${restoAddress}</p>` : ''}
            ${restoPhone ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #475569;">📞 ${restoPhone}</p>` : ''}
          </td>
          <td width="50%" align="right" valign="top">
            <p style="margin: 0; font-size: 10px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 0.5px;">Informations de Commande</p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #334155; font-weight: 600;">📅 ${orderDate}</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #334155;">💳 Mode : <strong>${paymentMethodLabel}</strong></p>
            <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 800; color: ${paymentStatusColor};">Statut : ${paymentStatusLabel}</p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Customer Delivery Address -->
    <div style="padding: 20px 32px; border-bottom: 1px solid #e2e8f0; background-color: #ffffff;">
      <p style="margin: 0 0 4px 0; font-size: 10px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 0.5px;">Destination & Modalité</p>
      <p style="margin: 0; font-size: 13px; font-weight: 700; color: #1e293b;">${deliveryAddress}</p>
    </div>

    <!-- Items Table -->
    <div style="padding: 24px 32px;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #cbd5e1; background-color: #f1f5f9;">
            <th align="left" style="padding: 10px 16px; font-size: 11px; text-transform: uppercase; font-weight: 900; color: #475569; letter-spacing: 0.5px;">Désignation</th>
            <th align="center" style="padding: 10px 16px; font-size: 11px; text-transform: uppercase; font-weight: 900; color: #475569; letter-spacing: 0.5px;">Qté</th>
            <th align="right" style="padding: 10px 16px; font-size: 11px; text-transform: uppercase; font-weight: 900; color: #475569; letter-spacing: 0.5px;">P.U</th>
            <th align="right" style="padding: 10px 16px; font-size: 11px; text-transform: uppercase; font-weight: 900; color: #475569; letter-spacing: 0.5px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Totals Block -->
      <div style="margin-top: 24px; padding-top: 16px; border-top: 2px solid #e2e8f0;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td width="50%" valign="top">
              <div style="background-color: #f8fafc; border-radius: 12px; padding: 14px; border: 1px solid #cbd5e1;">
                <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b;">Notice & Certification</p>
                <p style="margin: 0; font-size: 11px; color: #475569; line-height: 1.4;">
                  Cette facture est générée automatiquement et certifiée conforme par DashMeals. Conservez ce reçu pour vos archives financières.
                </p>
              </div>
            </td>
            <td width="50%" align="right" valign="top">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #64748b;">Sous-total :</td>
                  <td align="right" style="padding: 4px 0; font-size: 12px; font-family: monospace; font-weight: 700; color: #1e293b;">
                    ${formatDualPrice(subtotal, currency, exchangeRate, currencyMode)}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #64748b;">Frais de livraison :</td>
                  <td align="right" style="padding: 4px 0; font-size: 12px; font-family: monospace; font-weight: 700; color: #1e293b;">
                    ${deliveryFee > 0 ? formatDualPrice(deliveryFee, currency, exchangeRate, currencyMode) : 'Gratuit'}
                  </td>
                </tr>
                <tr style="border-top: 2px solid #0f172a;">
                  <td style="padding: 10px 0 0 0; font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase;">Total Payé :</td>
                  <td align="right" style="padding: 10px 0 0 0; font-size: 16px; font-family: monospace; font-weight: 900; color: #ea580c;">
                    ${formatDualPrice(totalAmount, currency, exchangeRate, currencyMode)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f1f5f9; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 11px; color: #64748b; font-weight: 600;">
        DashMeals RDC SAS • Plateforme Culinaire & Services de Livraison • Kinshasa, RDC
      </p>
      <p style="margin: 4px 0 0 0; font-size: 10px; color: #94a3b8;">
        Pour toute demande de support, contactez support@dashmeals.cd
      </p>
    </div>
  </div>

</body>
</html>`;
}

/**
 * Trigger download or open PDF print window for an order invoice
 */
export function downloadOrderInvoicePDF(order: Order, restaurant?: Restaurant): void {
  const invoiceHtml = generateOrderInvoiceHTML(order, restaurant);
  
  // Try opening printable invoice window
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(invoiceHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (e) {
        console.warn('Could not auto-trigger print:', e);
      }
    }, 400);
  } else {
    // Fallback: create downloadable HTML/PDF file
    const blob = new Blob([invoiceHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Facture_DashMeals_${order.id.slice(0, 8).toUpperCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
