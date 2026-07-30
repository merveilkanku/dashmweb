import React, { useState } from 'react';
import { 
  Search, ChevronRight, ChevronDown, Mail, Phone, MessageSquare, 
  HelpCircle, Book, Shield, Zap, ShoppingBag, Truck, CreditCard, User, Store, X, Bot, Send, Sparkles, Loader2,
  Check, ThumbsUp, ThumbsDown, Copy, RefreshCw, AlertTriangle, Compass, ExternalLink, LifeBuoy, Wrench, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

import { AppSettings } from '../types';
import { getSmartSupportResponse } from '../lib/gemini';

interface Article {
  id: string;
  title: string;
  content: string;
  tags?: string[];
}

interface HelpSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  articles: Article[];
}

const getHelpContent = (appSettings?: AppSettings | null): HelpSection[] => [
  {
    id: 'getting-started',
    title: 'Premiers Pas & Prise en Main (100%)',
    icon: <Zap className="w-5 h-5 text-amber-500" />,
    articles: [
      {
        id: 'full-experience',
        title: 'Comment utiliser DashMeals à 100% de son potentiel ?',
        content: "Pour vivre l'expérience DashMeals à 100% :\n\n1️⃣ **Profil complet** : Renseignez vos numéros actifs pour le paiement Mobile Money (M-Pesa, Orange Money, Airtel Money) et la livraison.\n2️⃣ **Géolocalisation précise** : Activez le GPS pour permettre aux livreurs de localiser exactement votre adresse à Kinshasa, Lubumbashi ou Goma sans approximations.\n3️⃣ **Notifications en direct** : Autorisez les notifications système pour suivre la préparation et la livraison de votre repas en temps réel.\n4️⃣ **Statut de présence 'Style Facebook'** : Observez le voyant vert pour voir quand votre livreur ou le restaurant est actif et disponible.",
        tags: ['débutant', 'profil', 'gps']
      },
      {
        id: 'create-account',
        title: 'Comment créer et sécuriser mon compte ?',
        content: "Cliquez sur 'S'inscrire' depuis l'écran d'accueil. Choisissez votre rôle (Client, Partenaire Restaurant ou Livreur). Vous pouvez créer un compte avec votre email et mot de passe, ou utiliser le bouton **Google Sign-In** pour une connexion instantanée en un clic sans mot de passe à retenir.",
        tags: ['compte', 'inscription', 'google']
      },
      {
        id: 'login-issues',
        title: 'Que faire en cas de problème de connexion ou mot de passe oublié ?',
        content: "Si vous ne parvenez pas à vous connecter, cliquez sur **'Mot de passe oublié'** sur l'écran de connexion. Saisissez votre email et un lien sécurisé de réinitialisation vous sera envoyé immédiatement. Si le problème persiste, notre support téléphonique et WhatsApp sont disponibles 7j/7.",
        tags: ['connexion', 'mot de passe', 'sécurité']
      }
    ]
  },
  {
    id: 'payments',
    title: 'Paiements & Mobile Money (M-Pesa, Orange, Airtel, Cash)',
    icon: <CreditCard className="w-5 h-5 text-emerald-500" />,
    articles: [
      {
        id: 'mobile-money-drc',
        title: 'Comment payer mes commandes par Mobile Money (M-Pesa, Airtel, Orange) ?',
        content: "DashMeals prend en charge les principaux moyens de paiement en République Démocratique du Congo :\n\n- **M-Pesa (Vodacom)**\n- **Orange Money**\n- **Airtel Money**\n- **FlexPay / Carte bancaire**\n- **Espèces à la livraison (Cash)**\n\nLors de la validation de votre panier, choisissez 'Mobile Money', sélectionnez votre opérateur et entrez votre numéro. Vous recevrez une notification USSD sur votre téléphone pour valider votre code PIN.",
        tags: ['mpesa', 'airtel', 'orange', 'paiement']
      },
      {
        id: 'payment-failed',
        title: 'Mon paiement Mobile Money a été débité mais la commande n\'est pas validée ?',
        content: "Pas de panique ! La validation USSD peut parfois prendre 30 à 60 secondes en raison des réseaux télécoms. Si votre solde a été prélevé mais que la commande n'apparaît pas dans 'Mes Commandes' :\n\n1. Attendez 2 minutes et rafraîchissez l'application.\n2. Si la commande n'est toujours pas là, contactez immédiatement le support WhatsApp avec votre référence de transaction M-Pesa/Orange/Airtel.\n3. Notre équipe régularisera ou créditera instantanément votre compte.",
        tags: ['erreur', 'dépannage', 'remboursement']
      },
      {
        id: 'exchange-rate',
        title: 'Quelle est la devise utilisée et le taux de change USD / CDF ?',
        content: `Sur DashMeals, les prix sont affichés en USD et en Francs Congolais (CDF). Le taux officiel appliqué sur la plateforme est mis à jour selon la réglementation centrale (actuellement fixée à **${appSettings?.payment_exchange_rate || 2850} CDF = 1 USD**). Vous pouvez passer d'une monnaie à l'autre en haut de l'écran.`,
        tags: ['devise', 'usd', 'cdf', 'taux']
      }
    ]
  },
  {
    id: 'orders-gps',
    title: 'Commandes, Attribution & Suivi GPS',
    icon: <ShoppingBag className="w-5 h-5 text-rose-500" />,
    articles: [
      {
        id: 'place-order-guide',
        title: 'Comment passer une commande étape par étape ?',
        content: "1. Choisissez un restaurant partenaire proche de votre commune.\n2. Parcourez le menu et ajoutez vos plats au panier (vous pouvez ajouter des options et instructions de préparation).\n3. Indiquez votre adresse de livraison exacte et un repère géographique (ex: près du Boulevard, croisement Huileries).\n4. Sélectionnez votre mode de paiement et validez.\n5. Suivez la préparation en direct !",
        tags: ['commande', 'plat', 'livraison']
      },
      {
        id: 'delivery-assignment',
        title: 'Comment est attribué mon livreur ?',
        content: "Dès que le restaurant accepte votre commande, l'application sélectionne automatiquement le livreur géolocalisé le plus proche et **En ligne**. Vous recevrez le nom, la photo et le numéro de téléphone de votre livreur ainsi que sa position en direct.",
        tags: ['livreur', 'attribution', 'gps']
      },
      {
        id: 'cancel-order',
        title: 'Puis-je annuler ou modifier une commande déjà validée ?',
        content: "Tant que la commande est au statut **'En attente'**, vous pouvez l'annuler directement dans l'application via le bouton 'Annuler la commande'. Si le restaurant a déjà commencé la préparation, l'annulation nécessite un contact rapide via le chat direct ou le support téléphonique.",
        tags: ['annulation', 'modification', 'remboursement']
      }
    ]
  },
  {
    id: 'presence-status',
    title: 'Statuts de Présence & Chat Direct (Style Facebook)',
    icon: <User className="w-5 h-5 text-cyan-500" />,
    articles: [
      {
        id: 'how-presence-works',
        title: 'Qu\'est-ce que l\'indicateur En Ligne vert (Style Messenger) ?',
        content: "Pour offrir une transparence maximale, DashMeals intègre un voyant vert de présence en temps réel. Il clignote lorsque le livreur ou le restaurant est activement sur l'application. S'il est déconnecté, l'application indique la dernière fois qu'il a été vu (ex: 'vu il y a 5 min').",
        tags: ['présence', 'en ligne', 'chat']
      },
      {
        id: 'live-chat-usage',
        title: 'Comment utiliser la messagerie en direct ?',
        content: "Pour chaque commande active, un canal de chat confidentiel est ouvert entre le Client, le Livreur et le Restaurant. Utilisez-le pour préciser un repère de livraison, demander des couverts supplémentaires ou signaler un retard sans avoir besoin d'effectuer un appel payant.",
        tags: ['chat', 'message', 'livreur']
      }
    ]
  },
  {
    id: 'partners-space',
    title: 'Espace Partenaires & Restaurateurs',
    icon: <Store className="w-5 h-5 text-purple-500" />,
    articles: [
      {
        id: 'register-restaurant',
        title: 'Comment inscrire mon restaurant sur DashMeals ?',
        content: "Pour devenir restaurant partenaire :\n\n1. Cliquez sur 'S'inscrire' > 'Partenaire Restaurant'.\n2. Renseignez le nom de votre établissement, l'adresse à Kinshasa/Lubumbashi/Goma et vos coordonnées.\n3. Renseignez votre numéro Mobile Money pour recevoir directement vos revenus de ventes.\n4. Notre équipe de validation vérifie vos documents sous 24h pour activer votre badge certifié.",
        tags: ['restaurant', 'partenaire', 'inscription']
      },
      {
        id: 'subscription-tiers',
        title: 'Quelles sont les formules d\'abonnement pour restaurateurs ?',
        content: "DashMeals propose 3 formules adaptées à votre croissance :\n- **Basic** : Accès au catalogue, gestion des commandes de base et 100 repas/mois.\n- **Premium** : Visibilité prioritaire, statistiques avancées, livraisons illimitées et support VIP 24/7.\n- **Enterprise** : Multi-succursales, intégration POS sur mesure et gestionnaire de compte dédié.",
        tags: ['abonnement', 'tarifs', 'premium']
      }
    ]
  },
  {
    id: 'delivery-space',
    title: 'Espace Chauffeurs & Livreurs',
    icon: <Truck className="w-5 h-5 text-blue-500" />,
    articles: [
      {
        id: 'driver-earnings',
        title: 'Comment maximiser mes gains et recevoir mes livraisons ?',
        content: "Pour recevoir régulièrement des propositions de courses :\n1. Connectez-vous et basculez votre interrupteur sur **'Disponible'**.\n2. Gardez votre GPS actif pour que les restaurants proches vous repèrent.\n3. Assurez une livraison rapide et courtoise pour obtenir des notes 5 étoiles et des pourboires.",
        tags: ['livreur', 'moto', 'gains']
      }
    ]
  },
  {
    id: 'contact-official',
    title: 'Contacts Officiels & Siège RDC',
    icon: <HelpCircle className="w-5 h-5 text-indigo-500" />,
    articles: [
      {
        id: 'official-contacts',
        title: 'Quelles sont nos coordonnées officielles et adresses en RDC ?',
        content: `Notre centre de support et nos bureaux administratifs sont basés à Kinshasa, RDC :\n\n- 📧 **E-mail** : ${appSettings?.support_email || 'support@dashmeals-rdc.com'}\n- 📞 **Téléphone d'urgence** : ${appSettings?.support_phone || '+243 842 578 529'}\n- 💬 **WhatsApp direct** : ${appSettings?.support_whatsapp || '+243 842 578 529'}\n- 🏢 **Adresse physique** : ${appSettings?.office_address || 'Boulevard du 30 Juin, Gombe, Kinshasa, RDC.'}\n\nLe support réagit 7j/7 entre 7h00 et 23h00.`,
        tags: ['contact', 'email', 'adresse', 'telephone']
      }
    ]
  }
];

interface QuickDiagnosticIssue {
  id: string;
  title: string;
  icon: React.ReactNode;
  category: string;
  summary: string;
  steps: string[];
  actionLabel?: string;
  actionType?: 'whatsapp' | 'call' | 'ticket' | 'faq';
}

const DIAGNOSTIC_ISSUES: QuickDiagnosticIssue[] = [
  {
    id: 'order-delay',
    title: 'Ma commande accuse du retard',
    icon: <Truck className="w-5 h-5 text-amber-500" />,
    category: 'Livraison',
    summary: 'Si le délai estimé est dépassé de plus de 15 minutes :',
    steps: [
      "Ouvrez 'Mes Commandes' et vérifiez l'étape actuelle (En préparation / En cours de livraison).",
      "Regardez si le voyant vert de votre livreur est allumé.",
      "Utilisez le chat direct de la commande pour demander un état des lieux sans frais.",
      "Si aucune réponse n'est obtenue sous 5 minutes, contactez la hotline d'urgence."
    ],
    actionLabel: 'Appeler la Hotline Urgence',
    actionType: 'call'
  },
  {
    id: 'payment-issue',
    title: 'Paiement M-Pesa / Mobile Money échoué',
    icon: <CreditCard className="w-5 h-5 text-rose-500" />,
    category: 'Paiement',
    summary: 'Pour résoudre un blocage de paiement USSD :',
    steps: [
      "Vérifiez que votre ligne téléphonique dispose d'un solde suffisant en USD ou CDF.",
      "Assurez-vous de saisir votre code PIN secret immédiatement après l'invite USSD.",
      "Si votre compte a été prélevé mais la commande annulée, conservez le SMS de l'opérateur.",
      "Transmettez l'ID de la transaction à notre support pour régularisation instantanée."
    ],
    actionLabel: 'Envoyer la preuve sur WhatsApp',
    actionType: 'whatsapp'
  },
  {
    id: 'modify-address',
    title: 'Changer mon adresse de livraison',
    icon: <Compass className="w-5 h-5 text-blue-500" />,
    category: 'Commande',
    summary: 'Pour mettre à jour la destination de votre repas :',
    steps: [
      "Si le livreur n’a pas encore récupéré le colis, envoyez-lui la nouvelle adresse dans le Chat Direct de la commande.",
      "Si l'adresse change de commune, des frais additionnels légers de livraison peuvent s'appliquer."
    ],
    actionLabel: 'Ouvrir un ticket au support',
    actionType: 'ticket'
  },
  {
    id: 'partner-registration',
    title: 'Je veux ajouter mon restaurant ou deveneir livreur',
    icon: <Store className="w-5 h-5 text-purple-500" />,
    category: 'Partenariat',
    summary: 'Pour rejoindre le réseau DashMeals RDC :',
    steps: [
      "Rendez-vous sur l'écran d'inscription et sélectionnez 'Partenaire Restaurant' ou 'Livreur'.",
      "Téléchargez vos pièces justificatives (Pièce d'identité / Documents d'entreprise).",
      "L'activation est traitée sous 24h ouvrées."
    ],
    actionLabel: 'Lire le guide complet',
    actionType: 'faq'
  }
];

interface Props {
  user: any;
  onClose: () => void;
  appSettings?: AppSettings | null;
}

export const HelpCenter: React.FC<Props> = ({ user, onClose, appSettings }) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'faq' | 'wizard' | 'contact'>('ai');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [articleFeedback, setArticleFeedback] = useState<Record<string, 'up' | 'down'>>({});
  
  // Contact Form State
  const [showContactForm, setShowContactForm] = useState(false);
  const [ticketCategory, setTicketCategory] = useState('Paiement & Mobile Money');
  const [ticketPriority, setTicketPriority] = useState('normal');
  const [ticketOrderId, setTicketOrderId] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Diagnostic Wizard State
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<QuickDiagnosticIssue | null>(null);

  // AI Chat State
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string; time?: string }[]>([
    {
      role: 'ai',
      text: "Bonjour ! 👋 Je suis l'assistant intelligent DashMeals RDC. Je réponds instantanément à toutes vos questions sur vos commandes, les paiements Mobile Money (M-Pesa / Orange / Airtel), les livraisons à Kinshasa / Lubumbashi / Goma, ou la gestion de votre compte.",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const handleSendAiMessage = async (textToSend?: string) => {
    const msg = textToSend || aiInput;
    if (!msg.trim() || isAiLoading) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setAiMessages(prev => [...prev, { role: 'user', text: msg, time: timeStr }]);
    if (!textToSend) setAiInput('');
    setIsAiLoading(true);

    try {
      const replyText = await getSmartSupportResponse(msg, {
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role || 'customer'
      });
      setAiMessages(prev => [...prev, { 
        role: 'ai', 
        text: replyText, 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }]);
    } catch (err) {
      setAiMessages(prev => [...prev, { 
        role: 'ai', 
        text: "Une courte perturbation réseau est survenue. Notre support humain reste disponible 24/7 au +243 842 578 529 ou sur WhatsApp.", 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const clearAiChat = () => {
    setAiMessages([
      {
        role: 'ai',
        text: "Discussion réinitialisée ! Comment puis-je vous aider maintenant ?",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    toast.success("Discussion IA réinitialisée");
  };

  const helpSections = getHelpContent(appSettings);

  // Category list
  const categories = [
    { id: 'all', label: 'Tous les sujets' },
    { id: 'getting-started', label: 'Premiers Pas' },
    { id: 'payments', label: 'Paiements M-Pesa' },
    { id: 'orders-gps', label: 'Commandes & GPS' },
    { id: 'presence-status', label: 'Présence & Chat' },
    { id: 'partners-space', label: 'Restaurateurs' },
    { id: 'delivery-space', label: 'Livreurs' },
    { id: 'contact-official', label: 'Contacts' },
  ];

  // Filtering FAQ
  const filteredContent = helpSections
    .filter(section => selectedCategory === 'all' || section.id === selectedCategory)
    .map(section => ({
      ...section,
      articles: section.articles.filter(article => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        return (
          article.title.toLowerCase().includes(query) ||
          article.content.toLowerCase().includes(query) ||
          (article.tags && article.tags.some(t => t.toLowerCase().includes(query)))
        );
      })
    }))
    .filter(section => section.articles.length > 0);

  const totalArticlesCount = filteredContent.reduce((acc, sec) => acc + sec.articles.length, 0);

  const handleCopyArticle = (title: string, content: string) => {
    navigator.clipboard.writeText(`${title}\n\n${content}`);
    toast.success("Article copié dans le presse-papier !");
  };

  const handleFeedback = (articleId: string, type: 'up' | 'down') => {
    setArticleFeedback(prev => ({ ...prev, [articleId]: type }));
    toast.success(type === 'up' ? "Merci pour votre avis positif !" : "Merci. Nous allons améliorer cet article.");
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) {
      toast.error("Veuillez remplir le sujet et le message");
      return;
    }

    setIsSubmitting(true);
    try {
      const uuidUserId = user?.id && user.id !== 'guest' ? user.id : null;
      const fullSubject = `[${ticketCategory}] ${ticketSubject}` + (ticketOrderId ? ` (Commande #${ticketOrderId})` : '');
      const fullMessage = `[Priorité: ${ticketPriority.toUpperCase()}]\n` + ticketMessage;

      const { error } = await supabase.from('support_tickets').insert({
        user_id: uuidUserId,
        subject: fullSubject,
        message: fullMessage,
        status: 'open'
      });

      if (error) throw error;

      toast.success("Votre ticket a été soumis au support avec succès !");
      setShowContactForm(false);
      setTicketSubject('');
      setTicketMessage('');
      setTicketOrderId('');
    } catch (err) {
      console.error("Error sending ticket:", err);
      toast.error("Erreur lors de l'envoi du message au support");
    } finally {
      setIsSubmitting(false);
    }
  };

  const phoneNum = appSettings?.support_phone || "+243 842 578 529";
  const whatsappNum = appSettings?.support_whatsapp || "+243 842 578 529";
  const cleanWhatsapp = whatsappNum.replace(/\s+/g, '').replace('+', '');

  const triggerDiagnosticAction = (type?: string) => {
    if (type === 'whatsapp') {
      window.open(`https://wa.me/${cleanWhatsapp}`, '_blank');
    } else if (type === 'call') {
      window.location.href = `tel:${phoneNum}`;
    } else if (type === 'ticket') {
      setShowContactForm(true);
    } else if (type === 'faq') {
      setActiveTab('faq');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gray-50 dark:bg-gray-900 overflow-y-auto custom-scrollbar">
      {/* Top Header Bar */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3.5 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors border border-gray-200 dark:border-gray-700"
              title="Fermer"
            >
              <ChevronRight className="w-5 h-5 rotate-180 text-gray-700 dark:text-gray-300" />
            </button>
            <div>
              <h1 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-orange-500" />
                Centre d'aide & Assistance
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:block">
                Guide utilisateur, Assistant IA 24/7 & Support officiel DashMeals RDC
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://wa.me/${cleanWhatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 rounded-full text-xs font-bold hover:bg-green-500/20 transition-all"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              WhatsApp Live
            </a>
            <button 
              onClick={() => setShowContactForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-full text-xs font-bold hover:bg-orange-600 transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              <Mail className="w-4 h-4" />
              Ouvrir un ticket
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-2xl mb-6 shadow-sm">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'ai'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Bot className="w-4 h-4 shrink-0" />
            <span>Assistant IA 24/7</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
          </button>
          
          <button
            onClick={() => setActiveTab('faq')}
            className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'faq'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Book className="w-4 h-4 shrink-0" />
            <span>FAQ & Articles</span>
          </button>

          <button
            onClick={() => setActiveTab('wizard')}
            className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'wizard'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Wrench className="w-4 h-4 shrink-0 text-amber-300" />
            <span>Diagnostic Rapide</span>
          </button>

          <button
            onClick={() => setActiveTab('contact')}
            className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'contact'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Phone className="w-4 h-4 shrink-0" />
            <span>Contacts Directs</span>
          </button>
        </div>

        {/* TAB 1: AI ASSISTANT */}
        {activeTab === 'ai' && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-3xl overflow-hidden shadow-xl flex flex-col min-h-[580px] mb-8">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-2xl border border-white/20">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    Assistant IA DashMeals
                    <Sparkles className="w-4 h-4 text-amber-200 animate-spin" />
                  </h3>
                  <p className="text-xs text-orange-100 font-medium">
                    Intelligence Gemini • Réponses instantanées adaptées à la RDC
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={clearAiChat}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md text-xs font-bold rounded-full transition-colors flex items-center gap-1"
                  title="Réinitialiser la conversation"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Effacer</span>
                </button>
              </div>
            </div>

            {/* Quick Suggestions */}
            <div className="p-4 bg-orange-50/60 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-orange-500" />
                Questions fréquemment posées :
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Comment payer avec M-Pesa ?",
                  "Paiement par Orange / Airtel Money",
                  "Quel est le délai de livraison à Kinshasa ?",
                  "Comment suivre mon livreur en direct ?",
                  "Comment devenir restaurant partenaire ?",
                  "Inscrire mon véhicule comme livreur"
                ].map((sug, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendAiMessage(sug)}
                    className="text-xs font-semibold px-3 py-1.5 bg-white dark:bg-gray-700/80 hover:bg-orange-500 hover:text-white text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-full transition-all shadow-sm active:scale-95"
                  >
                    💡 {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[460px] custom-scrollbar">
              {aiMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-orange-500 text-white rounded-br-none font-medium'
                        : 'bg-gray-100 dark:bg-gray-700/90 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-bl-none whitespace-pre-wrap'
                    }`}
                  >
                    <div>{msg.text}</div>
                    {msg.time && (
                      <div className={`text-[10px] mt-2 text-right opacity-70 ${msg.role === 'user' ? 'text-orange-100' : 'text-gray-400'}`}>
                        {msg.time}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-700/90 p-4 rounded-2xl rounded-bl-none border border-gray-200 dark:border-gray-600 flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                    <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                    <span>L'IA analyse votre question...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAiMessage();
              }}
              className="p-3 sm:p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2"
            >
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="Posez votre question à l'assistant IA DashMeals..."
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-orange-500 rounded-xl focus:ring-0 text-xs sm:text-sm text-gray-900 dark:text-white"
                disabled={isAiLoading}
              />
              <button
                type="submit"
                disabled={!aiInput.trim() || isAiLoading}
                className="p-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-all disabled:opacity-50 active:scale-95 shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: FAQ & KNOWLEDGE BASE */}
        {activeTab === 'faq' && (
          <div className="space-y-6">
            {/* Search Bar & Counter */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="text"
                  placeholder="Rechercher par mot-clé (ex: M-Pesa, annuler, tarif, livraison...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-10 py-3.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all text-gray-900 dark:text-white"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                <Filter className="w-4 h-4 text-gray-400 shrink-0" />
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
                      selectedCategory === cat.id
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                <span>{totalArticlesCount} article{totalArticlesCount > 1 ? 's' : ''} disponible{totalArticlesCount > 1 ? 's' : ''}</span>
                {searchQuery && <span>Résultats filtrés pour : "{searchQuery}"</span>}
              </div>
            </div>

            {/* Help Sections List */}
            {filteredContent.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 p-8">
                <HelpCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <h3 className="font-bold text-gray-800 dark:text-gray-200">Aucun article trouvé</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                  Aucun résultat ne correspond à votre recherche "{searchQuery}". Posez votre question directement à l'assistant IA ou contactez notre support.
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full text-xs font-bold hover:bg-gray-200"
                  >
                    Réinitialiser les filtres
                  </button>
                  <button
                    onClick={() => setActiveTab('ai')}
                    className="px-4 py-2 bg-orange-500 text-white rounded-full text-xs font-bold hover:bg-orange-600"
                  >
                    Demander à l'Assistant IA
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredContent.map((section) => (
                  <div key={section.id} className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      {section.icon}
                      <h3 className="font-bold text-gray-900 dark:text-white uppercase tracking-wider text-xs">
                        {section.title}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                        {section.articles.length}
                      </span>
                    </div>

                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/80 shadow-sm">
                      {section.articles.map((article) => {
                        const isExpanded = expandedArticle === article.id;
                        const feedback = articleFeedback[article.id];

                        return (
                          <div key={article.id} className="group">
                            <button 
                              onClick={() => setExpandedArticle(isExpanded ? null : article.id)}
                              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                            >
                              <div className="flex items-center gap-3 pr-4">
                                <span className="font-bold text-sm text-gray-800 dark:text-gray-200 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                                  {article.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {article.tags && article.tags.length > 0 && (
                                  <span className="hidden md:inline-block text-[10px] font-semibold px-2 py-0.5 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 rounded-md border border-orange-200/50 dark:border-orange-800/50">
                                    #{article.tags[0]}
                                  </span>
                                )}
                                {isExpanded ? (
                                  <ChevronDown className="w-5 h-5 text-orange-500" />
                                ) : (
                                  <ChevronRight className="w-5 h-5 text-gray-400" />
                                )}
                              </div>
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden bg-gray-50/70 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700/50"
                                >
                                  <div className="p-5 text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                                    {article.content}

                                    {/* Action footer for article */}
                                    <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700/60 flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400 font-medium">Cet article vous a-t-il aidé ?</span>
                                        <button
                                          onClick={() => handleFeedback(article.id, 'up')}
                                          className={`p-1.5 rounded-lg border transition-all ${
                                            feedback === 'up'
                                              ? 'bg-green-500 text-white border-green-500'
                                              : 'hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700 text-gray-500'
                                          }`}
                                          title="Utile"
                                        >
                                          <ThumbsUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleFeedback(article.id, 'down')}
                                          className={`p-1.5 rounded-lg border transition-all ${
                                            feedback === 'down'
                                              ? 'bg-red-500 text-white border-red-500'
                                              : 'hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700 text-gray-500'
                                          }`}
                                          title="Pas utile"
                                        >
                                          <ThumbsDown className="w-3.5 h-3.5" />
                                        </button>
                                      </div>

                                      <button
                                        onClick={() => handleCopyArticle(article.title, article.content)}
                                        className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400 font-bold hover:underline"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                        Copier l'explication
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DIAGNOSTIC WIZARD */}
        {activeTab === 'wizard' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 rounded-3xl text-white shadow-lg">
              <div className="flex items-center gap-3 mb-2">
                <Wrench className="w-6 h-6 text-amber-200" />
                <h2 className="text-lg font-black">Assistant de Diagnostic & Résolution Rapide</h2>
              </div>
              <p className="text-xs sm:text-sm text-amber-100 max-w-2xl leading-relaxed">
                Rencontrez-vous un blocage ? Sélectionnez votre situation ci-dessous pour obtenir immédiatement les étapes de résolution officielles.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DIAGNOSTIC_ISSUES.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => setSelectedDiagnostic(issue)}
                  className={`p-5 bg-white dark:bg-gray-800 border rounded-3xl cursor-pointer transition-all hover:shadow-md ${
                    selectedDiagnostic?.id === issue.id
                      ? 'border-orange-500 ring-2 ring-orange-500/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-2xl shrink-0">
                      {issue.icon}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                        {issue.category}
                      </span>
                      <h3 className="font-bold text-sm text-gray-900 dark:text-white mt-0.5">{issue.title}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        {issue.summary}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedDiagnostic && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-900/40 p-6 rounded-3xl shadow-lg space-y-4"
              >
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-orange-100 dark:bg-orange-900/40 rounded-xl text-orange-600 dark:text-orange-400">
                      {selectedDiagnostic.icon}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-gray-900 dark:text-white">
                        Procédure : {selectedDiagnostic.title}
                      </h3>
                      <p className="text-xs text-gray-500">Suivez les étapes ci-dessous :</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => setSelectedDiagnostic(null)}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="space-y-3 pl-2">
                  {selectedDiagnostic.steps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>

                {selectedDiagnostic.actionLabel && (
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                    <button
                      onClick={() => triggerDiagnosticAction(selectedDiagnostic.actionType)}
                      className="px-5 py-2.5 bg-orange-500 text-white font-bold text-xs sm:text-sm rounded-full hover:bg-orange-600 transition-all shadow-sm flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {selectedDiagnostic.actionLabel}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        )}

        {/* TAB 4: DIRECT CONTACTS & SUPPORT */}
        {activeTab === 'contact' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/40 rounded-3xl p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="p-3.5 bg-orange-500 rounded-2xl text-white shrink-0 shadow-md">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold text-orange-900 dark:text-orange-100 mb-1">E-mail Officiel Support</h2>
                    <p className="text-orange-700/80 dark:text-orange-300 text-xs mb-3">Réponse garantie en moins de 30 minutes 7j/7 :</p>
                    <a 
                      href={`mailto:${appSettings?.support_email || 'support@dashmeals-rdc.com'}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 font-bold text-xs sm:text-sm rounded-xl hover:shadow-md transition-all border border-orange-200 dark:border-orange-800"
                    >
                      <Mail className="w-4 h-4 shrink-0" />
                      <span className="truncate">{appSettings?.support_email || 'support@dashmeals-rdc.com'}</span>
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40 rounded-3xl p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="p-3.5 bg-blue-500 rounded-2xl text-white shrink-0 shadow-md">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold text-blue-900 dark:text-blue-100 mb-1">Hotline Téléphonique</h2>
                    <p className="text-blue-700/80 dark:text-blue-300 text-xs mb-3">Ligne téléphonique directe (Urgence repas) :</p>
                    <a 
                      href={`tel:${phoneNum}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold text-xs sm:text-sm rounded-xl hover:shadow-md transition-all border border-blue-200 dark:border-blue-800"
                    >
                      <Phone className="w-4 h-4 shrink-0" />
                      <span>{phoneNum}</span>
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/40 rounded-3xl p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="p-3.5 bg-green-500 rounded-2xl text-white shrink-0 shadow-md">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold text-green-900 dark:text-green-100 mb-1">WhatsApp Officiel</h2>
                    <p className="text-green-700/80 dark:text-green-300 text-xs mb-3">Envoi instantané de captures et justificatifs :</p>
                    <a 
                      href={`https://wa.me/${cleanWhatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 font-bold text-xs sm:text-sm rounded-xl hover:shadow-md transition-all border border-green-200 dark:border-green-800"
                    >
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <span>{whatsappNum}</span>
                    </a>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-900/40 rounded-3xl p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="p-3.5 bg-purple-500 rounded-2xl text-white shrink-0 shadow-md">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold text-purple-900 dark:text-purple-100 mb-1">Bureaux & Siège Social</h2>
                    <p className="text-purple-700/80 dark:text-purple-300 text-xs mb-2">Accueil physique et partenariats :</p>
                    <p className="text-xs font-bold text-purple-950 dark:text-purple-100 leading-relaxed">
                      {appSettings?.office_address || 'Boulevard du 30 Juin, Gombe, Kinshasa, RDC.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Ticket Banner */}
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 dark:border-gray-700 text-center shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                Vous préférez soumettre un ticket détaillé ?
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-lg mx-auto leading-relaxed">
                Notre équipe technique et support étudiera directement votre demande et y apportera une solution avec suivi d'avancement.
              </p>
              <button
                onClick={() => setShowContactForm(true)}
                className="px-6 py-3.5 bg-orange-500 text-white rounded-full font-bold text-xs sm:text-sm hover:bg-orange-600 transition-all shadow-md hover:shadow-lg inline-flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Rédiger un ticket de support
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Support Ticket Modal */}
      <AnimatePresence>
        {showContactForm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col"
            >
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-orange-500/10 text-orange-500 rounded-xl">
                    <LifeBuoy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Soumettre un ticket au support</h3>
                    <p className="text-xs text-gray-500">Formulaire officiel d'assistance DashMeals</p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowContactForm(false)}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmitTicket} className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                      Catégorie du problème
                    </label>
                    <select
                      value={ticketCategory}
                      onChange={(e) => setTicketCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-gray-800 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white"
                    >
                      <option value="Paiement & Mobile Money">Paiement & Mobile Money</option>
                      <option value="Livraison & Livreur">Livraison & Livreur</option>
                      <option value="Commande & Restaurant">Commande & Restaurant</option>
                      <option value="Compte & Identifiants">Compte & Identifiants</option>
                      <option value="Partenariat & Validation">Partenariat & Validation</option>
                      <option value="Suggestion & Amélioration">Suggestion & Amélioration</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                      Niveau d'urgence
                    </label>
                    <select
                      value={ticketPriority}
                      onChange={(e) => setTicketPriority(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-gray-800 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white"
                    >
                      <option value="normal">Normale (Sous 1h)</option>
                      <option value="urgent">Urgente (Sous 15 min)</option>
                      <option value="critical">Critique (Commande bloquée)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    N° de commande (Optionnel)
                  </label>
                  <input 
                    type="text"
                    value={ticketOrderId}
                    onChange={(e) => setTicketOrderId(e.target.value)}
                    placeholder="Ex: #ORD-94820"
                    className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    Sujet de votre message *
                  </label>
                  <input 
                    type="text"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    placeholder="Ex: Confirmation M-Pesa non reçue pour la commande #94820"
                    className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    Description détaillée *
                  </label>
                  <textarea 
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    placeholder="Veuillez décrire le problème rencontré (heure, lieu, opérateur M-Pesa / Orange / Airtel, etc.)..."
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 resize-none text-gray-900 dark:text-white"
                    required
                  />
                </div>

                <div className="pt-2">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Transmission en cours...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Envoyer le ticket au support</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
