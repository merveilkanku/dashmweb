const fs = require('fs');

const filesToProcess = [
  'components/CustomerView.tsx',
  'BusinessDashboard.tsx',
  'components/DeliveryView.tsx',
  'components/SuperAdminDashboard.tsx'
];

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Make sure useTranslation is imported and instantiated if replacing with t()
  // Actually, some files might not have `const t = useTranslation(language)`
  
  for (const [search, replace] of Object.entries(replacements)) {
    // Escape string for regex if needed, or just use string replace loop
    // BUT we have to be careful with quotes when replacing hardcoded text with {t('some_key')}
    // A regex approach:
    const regex = new RegExp(`>\\s*${search}\\s*<`, 'g');
    content = content.replace(regex, `>{t('${replace}')}<`);
    
    const regex2 = new RegExp(`>\\s*${search}\\s*\\{`, 'g'); // Handle "Text {variable}"
    content = content.replace(regex2, `>{t('${replace}')} {`);
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

// Just map common visible strings to translation keys
const words = {
  "Catégories": "categories",
  "Filtrer": "filter",
  "Rechercher un établissement...": "search",
  "Vue d'ensemble": "overview",
  "Mon Panier": "cart",
  "Voir le panier": "view_cart",
  "Commander": "checkout",
  "Ajouter": "add",
  "Annuler": "cancel",
  "Confirmer": "confirm",
  "Fermer": "close",
  "Historique": "order_history",
  "Total": "total",
  "Paramètres": "settings",
  "Profil": "profile",
  "Sauvegarder": "save",
  "Enregistrer": "save",
  "Livraison": "delivery",
  "Restaurants": "restaurants",
  "Boutiques": "shops",
  "Pharmacies": "pharmacies",
  "Supermarchés": "supermarkets",
  "Populaires": "popular",
  "Nouveau": "new_order"
};

filesToProcess.forEach(file => {
  replaceInFile(file, words);
});
