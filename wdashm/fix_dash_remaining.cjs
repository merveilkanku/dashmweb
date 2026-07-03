const fs = require('fs');

const file = 'BusinessDashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const fixes = [
  { search: /Tableau de{" "}\n\s*<span[^>]*>\n\s*bord\n\s*<\/span>/g, replace: "{t('overview_title')}" },
  { search: /Analyse stratégique IA/g, replace: "{t('ai_analysis')}" },
  { search: /État critique des stocks/g, replace: "{t('stock_critical')}" },
  { search: /Statut de diffusion/g, replace: "{t('broadcast_status')}" },
  { search: /Livreurs Actifs/g, replace: "{t('active_riders')}" },
  { search: /Flux d'Activité Récent/g, replace: "{t('recent_activity')}" }
];

fixes.forEach(f => {
  content = content.replace(f.search, f.replace);
});

fs.writeFileSync(file, content, 'utf8');
console.log("Remaining manual fixes applied");
