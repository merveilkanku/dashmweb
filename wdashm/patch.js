import fs from 'fs';
let content = fs.readFileSync('components/HelpCenter.tsx', 'utf-8');
const target = "content: `Pour toute réclamation, signalement ou suggestion, notre canal d'écoute officiel et direct est l'adresse email : ${appSettings?.support_email || 'support@dashmeals-rdc.com'}.${appSettings?.support_phone ? \\` Téléphone d'urgence : ${appSettings?.support_phone || \"+243 81 000 0000\"}.\\` : ''}${appSettings?.support_whatsapp ? \\` WhatsApp : ${appSettings?.support_whatsapp || \"+243 81 000 0001\"}.\\` : ''}${appSettings?.office_address ? \\` Siège social : ${appSettings.office_address}.\\` : ''} Notre équipe d'assistance répond généralement en moins de 30 minutes 7j/7.`";
const replacement = "content: `Pour toute réclamation, signalement ou suggestion, notre canal d'écoute officiel et direct est l'adresse email : ${appSettings?.support_email || 'support@dashmeals-rdc.com'}. Téléphone d'urgence : ${appSettings?.support_phone || '+243 81 000 0000'}. WhatsApp : ${appSettings?.support_whatsapp || '+243 81 000 0001'}. Siège social : ${appSettings?.office_address || 'Boulevard du 30 Juin, Gombe, Kinshasa, RDC.'}. Notre équipe d'assistance répond généralement en moins de 30 minutes 7j/7.`";

if(content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('components/HelpCenter.tsx', content);
  console.log("Patched successfully");
} else {
  console.log("Target not found!");
}
