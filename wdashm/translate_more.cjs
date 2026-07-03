const fs = require('fs');

const filesToProcess = [
  'BusinessDashboard.tsx',
  'components/CustomerView.tsx',
  'components/SuperAdminDashboard.tsx'
];

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  for (const [search, replace] of Object.entries(replacements)) {
    // Exact match for tag content
    const regex = new RegExp(`>\\s*${search}\\s*<`, 'g');
    content = content.replace(regex, `>{t('${replace}')}<`);
    
    // Label
    const regexLabel = new RegExp(`<label[^>]*>\\s*${search}\\s*</label>`, 'g');
    content = content.replace(regexLabel, match => match.replace(search, `{t('${replace}')}`));

    // span
    const regexSpan = new RegExp(`<span[^>]*>\\s*${search}\\s*</span>`, 'g');
    content = content.replace(regexSpan, match => match.replace(search, `{t('${replace}')}`));

    // p
    const regexP = new RegExp(`<p[^>]*>\\s*${search}\\s*</p>`, 'g');
    content = content.replace(regexP, match => match.replace(search, `{t('${replace}')}`));
    
    // button
    const regexBtn = new RegExp(`<button[^>]*>\\s*${search}\\s*</button>`, 'g');
    content = content.replace(regexBtn, match => match.replace(search, `{t('${replace}')}`));
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

// Map common French UI strings to translation keys already existing in i18n
const words = {
  "Mettre à jour": "update",
  "Sécurité du Compte": "account_security",
  "Nouveau mot de passe": "new_password",
  "Mot de passe": "password",
  "Adresse": "address",
  "Ville": "city",
  "Pays": "country",
  "Téléphone": "phone",
  "Téléphone (Public)": "phone_public",
  "Panier": "cart",
  "Connexion": "login",
  "Inscription": "signup",
  "Se connecter": "login_btn",
  "S'inscrire": "signup_btn",
  "Aide": "help",
  "Support": "support",
  "Contactez-nous": "contact_us",
  "Devenir Partenaire": "partner",
  "Devenir Livreur": "driver",
  "Déconnexion": "logout",
  "Apparence": "appearance",
  "Langue": "language",
  "Thème": "theme",
  "Menu & Carte": "menu",
  "Commandes": "orders",
  "Marketing": "marketing",
  "Abonnement": "billing",
  "Toutes les commandes": "all_orders",
  "Commandes en cours": "active_orders",
  "Commandes terminées": "completed_orders",
  "Dernière commande": "last_order",
  "Total Commandes": "total_orders",
  "Confidentialité": "privacy",
  "Nom complet": "full_name",
  "Nom": "name"
};

filesToProcess.forEach(file => {
  replaceInFile(file, words);
});
