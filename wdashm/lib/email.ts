import { fetchWithRetry } from '../utils/fetch';
import { supabase } from './supabase';

export const sendEmail = async ({ to, subject, html, from }: { to: string | string[], subject: string, html: string, from?: string }) => {
  try {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data?.session?.access_token || '';

    const response = await fetchWithRetry('/api/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ to, subject, html, from }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to send email';
      try {
        const errorData = await response.json();
        errorMessage = typeof errorData.error === 'object' 
          ? (errorData.error.message || JSON.stringify(errorData.error)) 
          : (errorData.error || errorMessage);
      } catch (e) {
        errorMessage = `Email server error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    try {
      return await response.json();
    } catch (e) {
      return { success: true }; // Fallback if server returned 200 but no JSON
    }
  } catch (error: any) {
    console.error('Email sending failed:', error.message || error);
    // We don't want to break the app flow if email fails
    return null;
  }
};

export const sendOrderConfirmationEmail = async (order: any, userEmail: string) => {
  const itemsHtml = order.items.map((item: any) => `
    <li>${item.quantity}x ${item.name} - $${(item.price * item.quantity).toFixed(2)}</li>
  `).join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #ea580c;">Merci pour votre commande !</h1>
      <p>Votre commande <strong>#${order.id.slice(0, 8)}</strong> a été reçue et est en cours de traitement.</p>
      
      <h3>Détails de la commande :</h3>
      <ul>
        ${itemsHtml}
      </ul>
      
      <p><strong>Total : $${order.totalAmount.toFixed(2)}</strong></p>
      
      <p>Vous recevrez une notification dès que votre commande sera prête.</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #666;">DashMeals - Votre service de livraison préféré.</p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `Confirmation de votre commande DashMeals #${order.id.slice(0, 8)}`,
    html
  });
};

export const sendOrderStatusUpdateEmail = async (order: any, userEmail: string, status: string) => {
  const statusMessages: Record<string, string> = {
    preparing: "est en cours de préparation 🍳",
    ready: "est prête ! 🛍️",
    delivering: "est en route 🛵",
    delivered: "a été livrée. Bon appétit ! 😋",
    completed: "est terminée. Merci de votre confiance ! ✨",
    cancelled: "a été annulée ❌"
  };

  const statusMessage = statusMessages[status] || `a changé de statut : ${status}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #ea580c;">Mise à jour de votre commande</h1>
      <p>Votre commande <strong>#${order.id.slice(0, 8)}</strong> ${statusMessage}</p>
      
      <p>Vous pouvez suivre l'état de votre commande directement dans l'application.</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #666;">DashMeals - Votre service de livraison préféré.</p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `Mise à jour de votre commande DashMeals #${order.id.slice(0, 8)}`,
    html
  });
};

export const sendNewOrderNotificationToRestaurant = async (order: any, restaurantEmail: string, restaurantName: string) => {
  const itemsHtml = order.items.map((item: any) => `
    <li>${item.quantity}x ${item.name}</li>
  `).join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #ea580c;">Nouvelle commande reçue !</h1>
      <p>Bonjour <strong>${restaurantName}</strong>,</p>
      <p>Vous avez reçu une nouvelle commande <strong>#${order.id.slice(0, 8)}</strong>.</p>
      
      <h3>Détails de la commande :</h3>
      <ul>
        ${itemsHtml}
      </ul>
      
      <p><strong>Total à percevoir : $${order.totalAmount.toFixed(2)}</strong></p>
      
      <p>Veuillez vous rendre sur votre tableau de bord pour accepter la commande et commencer la préparation.</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #666;">DashMeals Business - Gérez votre restaurant en toute simplicité.</p>
    </div>
  `;

  return sendEmail({
    to: restaurantEmail,
    subject: `[DashMeals] Nouvelle commande #${order.id.slice(0, 8)}`,
    html
  });
};

export const sendVerificationStatusEmail = async (restaurantName: string, ownerEmail: string, status: 'verified' | 'rejected') => {
  const isVerified = status === 'verified';
  const subject = isVerified ? "Félicitations ! Votre restaurant est vérifié" : "Mise à jour concernant votre demande de vérification";
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: ${isVerified ? '#10b981' : '#ef4444'};">${isVerified ? 'Compte Vérifié !' : 'Action Requise'}</h1>
      <p>Bonjour <strong>${restaurantName}</strong>,</p>
      <p>${isVerified 
        ? "Nous avons le plaisir de vous informer que votre établissement a été vérifié avec succès. Vous bénéficiez désormais du badge de confiance sur la plateforme." 
        : "Après examen de vos documents, nous ne pouvons pas valider votre compte pour le moment. Veuillez vérifier vos documents et soumettre une nouvelle demande."}</p>
      
      <p>Connectez-vous à votre tableau de bord pour plus de détails.</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #666;">L'équipe DashMeals Admin.</p>
    </div>
  `;

  return sendEmail({
    to: ownerEmail,
    subject: `[DashMeals] ${subject}`,
    html
  });
};

export const sendSupportReplyEmail = async (userName: string, userEmail: string, ticketSubject: string, replyMessage: string) => {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #ea580c;">Réponse à votre demande de support</h1>
      <p>Bonjour <strong>${userName}</strong>,</p>
      <p>Notre équipe a répondu à votre message concernant : <em>${ticketSubject}</em></p>
      
      <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #ea580c; margin: 20px 0;">
        ${replyMessage}
      </div>
      
      <p>Vous pouvez consulter la discussion complète dans l'application.</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #666;">Support DashMeals.</p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `[DashMeals] Réponse à votre demande : ${ticketSubject}`,
    html
  });
};

export const sendPrivateCourierStatusEmail = async (order: any, userEmail: string, status: string) => {
  const statusMessages: Record<string, string> = {
    pending: "est en attente de livreur ⌛",
    preparing: "a été acceptée par le livreur, qui se dirige vers le point de retrait 🛵",
    ready: "est récupérée et en cours de transport 📦",
    delivering: "est en cours de livraison 🛵",
    delivered: "a été livrée avec succès ! ✅",
    completed: "est entièrement terminée. Merci de votre confiance ! ✨",
    cancelled: "a été annulée ❌"
  };

  const statusMessage = statusMessages[status] || `a changé de statut : ${status}`;
  const item = order.items?.[0] || {};
  const pickup = item.pickupAddress || "Non spécifié";
  const delivery = item.deliveryAddress || "Non spécifié";
  const description = item.description || "Colis général";

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #f0f0f0; padding: 24px; border-radius: 16px; background-color: #ffffff;">
      <h2 style="color: #ea580c; margin-top: 0;">Mise à jour de votre Course Privée 📦</h2>
      <p>Bonjour,</p>
      <p>Votre course privée <strong>#${order.id.slice(0, 8)}</strong> ${statusMessage}.</p>
      
      <div style="background-color: #fcf8f5; border: 1px solid #ffedd5; padding: 16px; border-radius: 12px; margin: 20px 0;">
        <h4 style="margin: 0 0 10px 0; color: #c2410c; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Détails de la course</h4>
        <p style="margin: 4px 0; font-size: 13px;"><strong>📍 Point de Retrait :</strong> ${pickup}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>🏁 Point de Livraison :</strong> ${delivery}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>📦 Description du Colis :</strong> ${description}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>💰 Forfait :</strong> $5.00 (14 000 FC)</p>
      </div>

      <p style="font-size: 13px; color: #4b5563;">Vous pouvez suivre la position de votre livreur et l'itinéraire exact en temps réel sur l'application DashMeals.</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 11px; color: #9ca3af; text-align: center;">DashMeals - Service de Courses Privées Ultra-Rapides.</p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `[DashMeals] Suivi de votre Course Privée #${order.id.slice(0, 8)}`,
    html
  });
};

export const sendSubscriptionRefundEmail = async (
  restaurantName: string,
  userEmail: string,
  netRefundAmount: number,
  txRef: string,
  reason?: string
) => {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #f0f0f0; padding: 24px; border-radius: 16px; background-color: #ffffff;">
      <h2 style="color: #2563eb; margin-top: 0;">Notification de Remboursement DashMeals Pay 💸</h2>
      <p>Bonjour,</p>
      <p>Nous vous confirmons que le remboursement au prorata pour votre établissement <strong>${restaurantName}</strong> a été validé et traité.</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 12px; margin: 20px 0;">
        <h4 style="margin: 0 0 10px 0; color: #166534; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Détails du remboursement</h4>
        <p style="margin: 4px 0; font-size: 13px;"><strong>🏢 Établissement :</strong> ${restaurantName}</p>
        <p style="margin: 4px 0; font-size: 14px;"><strong>💰 Montant net restitué :</strong> <span style="color: #15803d; font-weight: bold;">$${netRefundAmount.toFixed(2)} USD</span></p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>💳 Canal :</strong> DashMeals Pay (Mobile Money)</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>🔢 Réf. Transaction :</strong> <code>${txRef}</code></p>
        ${reason ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #475569;"><strong>📝 Motif :</strong> ${reason}</p>` : ''}
      </div>

      <p style="font-size: 13px; color: #4b5563;">Le montant a été crédité sur votre compte partenaire DashMeals Pay. Vous pouvez consulter les détails dans les notifications de votre tableau de bord partenaire.</p>
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 11px; color: #9ca3af; text-align: center;">DashMeals - Administration et Service Partenaire.</p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `[DashMeals] Confirmation de remboursement pour ${restaurantName}`,
    html
  });
};

export const sendTransactionInvoiceEmail = async ({
  clientEmail,
  clientName,
  restaurantName,
  invoiceNumber,
  invoiceType,
  grossAmount,
  feeAmount,
  netAmount,
  paymentChannel,
  txRef,
  date,
  notes
}: {
  clientEmail: string;
  clientName?: string;
  restaurantName: string;
  invoiceNumber: string;
  invoiceType: 'subscription' | 'refund' | 'order';
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  paymentChannel: string;
  txRef: string;
  date?: string;
  notes?: string;
}) => {
  const isRefund = invoiceType === 'refund';
  const isSub = invoiceType === 'subscription';

  const title = isRefund 
    ? 'FACTURE D\'AVOIR / REMBOURSEMENT' 
    : isSub 
      ? 'FACTURE D\'ABONNEMENT PARTENAIRE' 
      : 'FACTURE DE TRANSACTION';

  const badgeColor = isRefund ? '#dc2626' : '#16a34a';
  const badgeBg = isRefund ? '#fef2f2' : '#f0fdf4';
  const badgeText = isRefund ? 'REMBOURSER' : 'PAYÉ / CAPTURÉ';

  const formattedDate = date 
    ? new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Sanitize payment channel to avoid public exposure of third party providers
  const displayChannel = paymentChannel.includes('KPay') 
    ? paymentChannel.replace(/KPay Mobile Money Gateway|KPay Mobile Money|KPay/g, 'DashMeals Pay')
    : paymentChannel;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
      
      <!-- Invoice Header Banner -->
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: #ffffff; padding: 32px 36px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td valign="top">
              <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff;">DashMeals <span style="color: #6366f1;">Pay</span></h1>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Plateforme Culinaire & Service de Paiement</p>
            </td>
            <td align="right" valign="top">
              <span style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}33; font-size: 11px; font-weight: 900; text-transform: uppercase; padding: 6px 14px; border-radius: 50px; letter-spacing: 0.5px;">
                ${badgeText}
              </span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Invoice Metadata Bar -->
      <div style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 20px 36px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td width="50%" valign="top">
              <p style="margin: 0; font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 0.5px;">Type de Document</p>
              <p style="margin: 3px 0 0 0; font-size: 14px; font-weight: 800; color: #0f172a;">${title}</p>
              <p style="margin: 2px 0 0 0; font-size: 12px; font-family: monospace; font-weight: 700; color: #4f46e5;">N° ${invoiceNumber}</p>
            </td>
            <td width="50%" align="right" valign="top">
              <p style="margin: 0; font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 0.5px;">Réf. Transaction</p>
              <p style="margin: 3px 0 0 0; font-size: 13px; font-family: monospace; font-weight: 800; color: #334155;">${txRef}</p>
              <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">${formattedDate}</p>
            </td>
          </tr>
        </table>
      </div>

      <!-- Invoice Parties Body -->
      <div style="padding: 28px 36px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
          <tr>
            <td width="50%" valign="top" style="padding-right: 16px;">
              <div style="background-color: #f1f5f9; border-radius: 12px; padding: 16px; border: 1px solid #cbd5e1;">
                <p style="margin: 0 0 6px 0; font-size: 10px; font-weight: 900; text-transform: uppercase; color: #475569; letter-spacing: 0.5px;">Émetteur</p>
                <p style="margin: 0; font-size: 13px; font-weight: 800; color: #0f172a;">DashMeals RDC SAS</p>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #475569;">Passerelle Officielle DashMeals Pay</p>
                <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">Kinshasa, République Démocratique du Congo</p>
                <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">support@dashmeals.cd</p>
              </div>
            </td>
            <td width="50%" valign="top" style="padding-left: 16px;">
              <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0;">
                <p style="margin: 0 0 6px 0; font-size: 10px; font-weight: 900; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Destinataire / Partenaire</p>
                <p style="margin: 0; font-size: 13px; font-weight: 800; color: #0f172a;">${restaurantName}</p>
                ${clientName ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #334155;"><strong>Contact :</strong> ${clientName}</p>` : ''}
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #4f46e5; font-weight: 600;">${clientEmail}</p>
                <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">Moyen de paiement : ${displayChannel}</p>
              </div>
            </td>
          </tr>
        </table>

        <!-- Line Items Table -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background-color: #0f172a; color: #ffffff;">
              <th align="left" style="padding: 12px 16px; font-size: 11px; font-weight: 800; text-transform: uppercase; border-top-left-radius: 8px;">Désignation / Description</th>
              <th align="center" style="padding: 12px 16px; font-size: 11px; font-weight: 800; text-transform: uppercase;">Moyen</th>
              <th align="right" style="padding: 12px 16px; font-size: 11px; font-weight: 800; text-transform: uppercase; border-top-right-radius: 8px;">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 16px; font-size: 13px; font-weight: 700; color: #1e293b;">
                ${isSub ? 'Abonnement Partenaire DashMeals (Accès Plateforme)' : isRefund ? 'Remboursement au Prorata (Avoir DashMeals Pay)' : 'Achat de Service / Transaction'}
                ${notes ? `<br/><span style="font-size: 11px; font-weight: 400; color: #64748b; font-style: italic;">Notes : ${notes.replace(/KPay/g, 'DashMeals Pay')}</span>` : ''}
              </td>
              <td align="center" style="padding: 16px; font-size: 12px; color: #475569; font-weight: 600;">
                ${displayChannel}
              </td>
              <td align="right" style="padding: 16px; font-size: 14px; font-family: monospace; font-weight: 800; color: #0f172a;">
                $${Math.abs(grossAmount).toFixed(2)} USD
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Summary Totals Block -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td width="55%" valign="top">
              <div style="background-color: #f8fafc; border-radius: 12px; padding: 14px; border: 1px solid #cbd5e1;">
                <p style="margin: 0 0 4px 0; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b;">Notice Légale & Validation</p>
                <p style="margin: 0; font-size: 11px; color: #475569; line-height: 1.4;">
                  Cette facture électronique constitue une preuve officielle de règlement via le service DashMeals Pay. Générée automatiquement et certifiée conforme par DashMeals.
                </p>
              </div>
            </td>
            <td width="45%" valign="top" style="padding-left: 20px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #64748b;">Montant Brut :</td>
                  <td align="right" style="padding: 4px 0; font-size: 12px; font-family: monospace; font-weight: 700; color: #1e293b;">$${Math.abs(grossAmount).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 12px; color: #64748b;">Frais de Service (2.5%) :</td>
                  <td align="right" style="padding: 4px 0; font-size: 12px; font-family: monospace; font-weight: 700; color: #64748b;">$${Math.abs(feeAmount).toFixed(2)}</td>
                </tr>
                <tr style="border-top: 2px solid #0f172a;">
                  <td style="padding: 10px 0 4px 0; font-size: 14px; font-weight: 900; color: #0f172a;">MONTANT NET ${isRefund ? 'RESTITUÉ' : 'REÇU'} :</td>
                  <td align="right" style="padding: 10px 0 4px 0; font-size: 16px; font-family: monospace; font-weight: 900; color: ${isRefund ? '#dc2626' : '#16a34a'};">
                    $${Math.abs(netAmount).toFixed(2)} USD
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>

      <!-- Footer -->
      <div style="background-color: #f1f5f9; padding: 20px 36px; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #64748b; font-weight: 600;">
          DashMeals Inc. &bull; Service Administratif & Comptabilité Partenaires
        </p>
        <p style="margin: 4px 0 0 0; font-size: 10px; color: #94a3b8;">
          Pour toute question relative à cette facture, contactez billing@dashmeals.cd avec la référence ${txRef}.
        </p>
      </div>

    </div>
  `;

  return sendEmail({
    to: clientEmail,
    subject: `[Facture DashMeals Pay] ${title} - ${restaurantName} (${txRef})`,
    html
  });
};


