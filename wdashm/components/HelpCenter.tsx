import React, { useState } from 'react';
import { 
  Search, ChevronRight, ChevronDown, Mail, Phone, MessageSquare, 
  HelpCircle, Book, Shield, Zap, ShoppingBag, Truck, CreditCard, User, Store, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

import { AppSettings } from '../types';

interface HelpSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  articles: {
    id: string;
    title: string;
    content: string;
  }[];
}

const HELP_CONTENT: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Premiers Pas & Utilisation à 100%',
    icon: <Zap className="w-5 h-5 text-yellow-500" />,
    articles: [
      {
        id: 'full-experience',
        title: 'Comment utiliser DashMeals à 100% ?',
        content: "Pour vivre l'expérience DashMeals à 100% : 1️⃣ Complétez intégralement votre profil avec vos numéros de contact actifs (Mobile Money & GSM). 2️⃣ Activez d'emblée la géolocalisation pour aider les livreurs à trouver votre adresse exacte sans approximations à Kinshasa. 3️⃣ Autorisez les notifications système pour être immédiatement alerté en temps réel du statut de votre repas. 4️⃣ Utilisez l'indicateur de présence 'Style Facebook' pour communiquer précisément avec les livreurs et restaurants lorsqu'ils sont en ligne."
      },
      {
        id: 'create-account',
        title: 'Comment créer un compte ?',
        content: "Pour créer un compte, cliquez sur 'S'inscrire' sur notre page de garde. Choisissez votre catégorie : Client, Partenaire (Restaurant) ou Livreur. Vous pouvez également lier votre compte instantanément à l'aide de Google OAuth, garantissant une connexion ultra-rapide sans avoir à mémoriser de mot de passe supplémentaire."
      },
      {
        id: 'login-issues',
        title: 'Problèmes de connexion',
        content: "En cas d'oubli de vos identifiants, cliquez sur le lien 'Mot de passe oublié'. Un courriel de récupération hautement sécurisé vous sera instantanément adressé afin de vous rediriger vers l'interface dédiée de réinitialisation de mot de passe."
      }
    ]
  },
  {
    id: 'presence-status',
    title: 'Statuts de Présence (Style Facebook)',
    icon: <User className="w-5 h-5 text-green-500" />,
    articles: [
      {
        id: 'how-presence-works',
        title: 'Qu\'est-ce que l\'indicateur En Ligne ?',
        content: "Pour faciliter la coordination, DashMeals intègre un système de présence active en temps réel semblable aux réseaux sociaux comme Facebook Messenger. Un cercle vert clignotant s'affiche si votre interlocuteur (livreur ou restaurant) utilise activement l'application en ce moment précis. S'ils sont déconnectés, l'application estime et affiche automatiquement leur dernière heure d'activité (ex: 'vu il y a 8 min'), vous offrant une transparence complète."
      },
      {
        id: 'delivery-presence',
        title: 'Où puis-je observer ce statut vert ?',
        content: "L'indicateur se retrouve à plusieurs endroits clés : dans votre historique de commandes d'une part, pour voir si le livreur affecté prend la route en direct ; dans l'outil de clavardage d'autre part ; et au niveau de la liste globale des livreurs de la ville pour les restaurants, leur permettant de privilégier un livreur réactif en ligne."
      }
    ]
  },
  {
    id: 'live-messaging',
    title: 'Messagerie en direct & Chat',
    icon: <MessageSquare className="w-5 h-5 text-blue-500" />,
    articles: [
      {
        id: 'activate-chat',
        title: 'Comment démarrer un chat en temps réel ?',
        content: "Chaque commande active dote le client, le restaurant et le livreur d'un espace de bavardage confidentiel en direct. Ouvrez simplement les détails de votre commande en cours puis cliquez sur le bouton 'Chat' pour envoyer instantanément des messages. C'est l'outil indispensable pour définir l'étage d'un immeuble ou modifier un choix de boisson."
      },
      {
        id: 'presence-chat-indicator',
        title: 'Pourquoi voir si mon partenaire de chat est en ligne ?',
        content: "Le panneau de chat affiche le statut de connexion instantané ('En ligne' ou 'Dernière connexion'). Cela vous évite de passer de longs appels inutiles et vous conforte dans le fait que votre message a bien été lu ou est en cours de lecture."
      }
    ]
  },
  {
    id: 'orders-delivery',
    title: 'Commandes, Attribution & Suivi GPS',
    icon: <ShoppingBag className="w-5 h-5 text-rose-500" />,
    articles: [
      {
        id: 'place-order',
        title: 'Comment se passe la prise de commande ?',
        content: "Naviguez à travers l'annuaire des restaurants de votre ville, explorez les menus et ajoutez les spécialités au panier. Validez votre commande en sélectionnant votre mode de paiement de prédilection (Espèces à la livraison ou Mobile Money) et décidez d'une adresse de livraison."
      },
      {
        id: 'auto-assignment-process',
        title: 'Comment se fait l\'attribution d\'un livreur ?',
        content: "Dès que le restaurant valide votre repas, il sélectionne un compagnon de route parmi les livreurs listés actifs et connectés de votre zone. Le livreur reçoit instantanément une alerte, accepte la mission et prend en charge votre repas. Vous disposez de ses informations, de ses coordonnées téléphoniques et pouvez l'écrire à tout instant."
      },
      {
        id: 'order-tracking',
        title: 'Suivre ma livraison en temps réel',
        content: "Depuis l'onglet 'Mes Commandes', observez chaque étape de la vie de votre repas de manière transparente (En attente, Confirmée, En cours de préparation, Prête, En livraison, Livrée). L'emplacement du livreur se met à jour pour garantir un timing optimal."
      }
    ]
  },
  {
    id: 'partners-space',
    title: 'Espace Partenaires & Restaurateurs',
    icon: <Store className="w-5 h-5 text-purple-500" />,
    articles: [
      {
        id: 'manage-online-store',
        title: 'Gérer mon restaurant intelligemment',
        content: "Dans votre back-office professionnel, pilotez méticuleusement votre établissement en adaptant vos horaires, vos catégories et le stock réel de vos spécialités dans l'éditeur de menu. Paramétrez les détails de paiements mobiles (M-Pesa, Airtel, Orange) pour automatiser la réception de vos chiffres d'affaires."
      },
      {
        id: 'client-feedback-reviews',
        title: 'Gestion des avis et réputation',
        content: "Interagissez avec vos fidèles convives en examinant les avis et notes attribués à chaque commande achevée. C'est un moyen formidable d'adapter vos recettes et de fidéliser de nouveaux gourmets !"
      }
    ]
  },
  {
    id: 'delivery-space',
    title: 'Espace Chauffeurs & Livreurs',
    icon: <Truck className="w-5 h-5 text-orange-500" />,
    articles: [
      {
        id: 'earn-as-driver',
        title: 'Optimiser mes gains de livraison',
        content: "Pour être prêt à recevoir des livraisons, passez votre commutateur sur 'Disponible' via votre profil livreur. Veillez à garder l'application active pour signaler votre statut vert et en ligne aux restaurateurs environnants. Renseignez correctement votre type de transport (Moto, Vélo ou Véhicule) pour que les restaurants vous confient des missions adaptées."
      }
    ]
  },
  {
    id: 'support-contact-info',
    title: 'Support & Contacts Officiels',
    icon: <HelpCircle className="w-5 h-5 text-cyan-500" />,
    articles: [
      {
        id: 'official-email-details',
        title: 'Quelles sont nos coordonnées de support en RDC ?',
        content: "Pour toute réclamation, signalement ou suggestion, notre canal d'écoute officiel et direct est l'adresse email : support@dashmeals-rdc.com. S'il vous plaît, ignorez les anciennes extensions .cd et .io. Notre équipe technique et d'assistance répond généralement en moins de 30 minutes 7j/7."
      }
    ]
  }
];

interface Props {
  user: any;
  onClose: () => void;
  appSettings?: AppSettings | null;
}

export const HelpCenter: React.FC<Props> = ({ user, onClose, appSettings }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredContent = HELP_CONTENT.map(section => ({
    ...section,
    articles: section.articles.filter(article => 
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(section => section.articles.length > 0);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    setIsSubmitting(true);
    try {
      const uuidUserId = user?.id && user.id !== 'guest' ? user.id : null;
      const { error } = await supabase.from('support_tickets').insert({
        user_id: uuidUserId,
        subject: ticketSubject,
        message: ticketMessage,
        status: 'open'
      });

      if (error) throw error;

      toast.success("Votre message a été envoyé au support !");
      setShowContactForm(false);
      setTicketSubject('');
      setTicketMessage('');
    } catch (err) {
      console.error("Error sending ticket:", err);
      toast.error("Erreur lors de l'envoi du message");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-900 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b dark:border-gray-800 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <ChevronRight className="w-6 h-6 rotate-180" />
            </button>
            <h1 className="text-xl font-bold">Centre d'aide</h1>
          </div>
          <button 
            onClick={() => setShowContactForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            <Mail className="w-4 h-4" />
            Support
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            type="text"
            placeholder="Comment pouvons-nous vous aider ?"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-gray-100 dark:bg-gray-800 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 transition-all"
          />
        </div>

        {/* Support Info */}
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-500 rounded-xl text-white">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-orange-900 dark:text-orange-100 mb-1">Besoin d'une assistance directe ?</h2>
              <p className="text-orange-700 dark:text-orange-300 text-sm mb-4">
                Notre équipe est disponible pour vous aider. Contactez-nous par email à :
              </p>
              <a 
                href={`mailto:${appSettings?.support_email || 'support@dashmeals-rdc.com'}`}
                className="inline-flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold hover:underline"
              >
                <Mail className="w-4 h-4" />
                {appSettings?.support_email || 'support@dashmeals-rdc.com'}
              </a>
            </div>
          </div>
        </div>

        {appSettings?.support_phone && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-500 rounded-xl text-white">
                <Phone className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-1">Contact d'Urgence</h2>
                <p className="text-blue-700 dark:text-blue-300 text-sm mb-4">
                  Pour une assistance immédiate par téléphone :
                </p>
                <a 
                  href={`tel:${appSettings.support_phone}`}
                  className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold hover:underline"
                >
                  <Phone className="w-4 h-4" />
                  {appSettings.support_phone}
                </a>
              </div>
            </div>
          </div>
        )}

        {appSettings?.support_whatsapp && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 rounded-2xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-500 rounded-xl text-white">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-green-900 dark:text-green-100 mb-1">Support WhatsApp</h2>
                <p className="text-green-700 dark:text-green-300 text-sm mb-4">
                  Contactez-nous directement via WhatsApp :
                </p>
                <a 
                  href={`https://wa.me/${appSettings.support_whatsapp.replace(/\s+/g, '').replace('+', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-green-600 dark:text-green-400 font-bold hover:underline"
                >
                  <MessageSquare className="w-4 h-4" />
                  {appSettings.support_whatsapp}
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Help Sections */}
        <div className="space-y-6">
          {filteredContent.map((section) => (
            <div key={section.id} className="space-y-3">
              <div className="flex items-center gap-2 px-2">
                {section.icon}
                <h3 className="font-bold text-gray-900 dark:text-white uppercase tracking-wider text-xs">
                  {section.title}
                </h3>
              </div>
              <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl overflow-hidden divide-y dark:divide-gray-700">
                {section.articles.map((article) => (
                  <div key={article.id} className="group">
                    <button 
                      onClick={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                    >
                      <span className="font-medium text-gray-700 dark:text-gray-200">{article.title}</span>
                      {expandedArticle === article.id ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    <AnimatePresence>
                      {expandedArticle === article.id && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 pt-0 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                            {article.content}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Vous ne trouvez pas ce que vous cherchez ?
          </p>
          <button 
            onClick={() => setShowContactForm(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full font-bold hover:opacity-90 transition-opacity"
          >
            <MessageSquare className="w-5 h-5" />
            Contacter le support
          </button>
        </div>
      </div>

      {/* Contact Support Modal */}
      <AnimatePresence>
        {showContactForm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-xl font-bold">Contacter le support</h3>
                <button 
                  onClick={() => setShowContactForm(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleSubmitTicket} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sujet</label>
                  <input 
                    type="text"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    placeholder="Ex: Problème de paiement"
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                  <textarea 
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    placeholder="Décrivez votre problème en détail..."
                    rows={5}
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-orange-500 resize-none"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Envoi en cours..." : "Envoyer le message"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
