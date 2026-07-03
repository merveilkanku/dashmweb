const fs = require('fs');
let content = fs.readFileSync('components/DeliveryView.tsx', 'utf8');
content = content.replace(/\{t\('cancel'\)\}/g, '"Annuler"');
content = content.replace(/\{t\('close'\)\}/g, '"Fermer"');
content = content.replace(/>"Annuler"</g, '>Annuler<');
content = content.replace(/>"Fermer"</g, '>Fermer<');
fs.writeFileSync('components/DeliveryView.tsx', content);
