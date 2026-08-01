import React, { useState, useEffect, useRef } from 'react';
import { Send, X, Phone, User, Store, Check, CheckCheck, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { Message } from '../types';
import { sendPushNotification } from '../utils/notifications';
import { isUserOnline, formatLastSeen } from '../utils/presence';

interface Props {
  orderId: string;
  currentUser: { id: string; role: 'client' | 'business' | 'staff' | 'delivery'; name?: string };
  otherUserId: string;
  otherUserName: string;
  otherUserPhone?: string;
  otherUserRole?: string;
  restaurantId?: string;
  onClose: () => void;
}

export const ChatWindow: React.FC<Props> = ({ orderId, currentUser, otherUserId, otherUserName, otherUserRole, otherUserPhone, restaurantId, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [otherUserLastSeen, setOtherUserLastSeen] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch recipient's online status
  const fetchOtherUserPresence = async () => {
    if (!otherUserId || otherUserId.length < 5 || otherUserId.startsWith('mock-')) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('last_seen')
        .eq('id', otherUserId)
        .maybeSingle();
      if (!error && data) {
        setOtherUserLastSeen(data.last_seen);
      }
    } catch (err) {
      console.error("Failed to fetch recipient status", err);
    }
  };

  useEffect(() => {
    fetchOtherUserPresence();
    const presenceInterval = setInterval(fetchOtherUserPresence, 15000);
    return () => clearInterval(presenceInterval);
  }, [otherUserId]);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    fetchMessages(false);
    markMessagesAsRead();
    
    console.log(`[Chat] Initialisation du canal pour l'ordre: ${orderId}. Current user ID: ${currentUser.id} (Rôle: ${currentUser.role}), Target recipient ID: ${otherUserId}`);
    
    // Subscribe to new messages
    const channel = supabase
      .channel(`chat:${orderId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `order_id=eq.${orderId}`
      }, (payload) => {
        console.log("[Chat] Nouveau message reçu via Realtime:", payload.new);
        
        // Client-side guard check to ensure we only process messages for this specific chat channel
        if (payload.new && payload.new.order_id !== orderId) {
          console.log(`[Chat] Message ignoré (canal incorrect): reçu ${payload.new.order_id}, attendu ${orderId}`);
          return;
        }

        const newMsg: Message = {
            id: payload.new.id,
            orderId: payload.new.order_id,
            senderId: payload.new.sender_id,
            content: payload.new.content,
            createdAt: payload.new.created_at,
            isRead: payload.new.is_read || false
        };
        
        if (newMsg.senderId !== currentUser.id) {
            sendPushNotification(`Nouveau message de ${otherUserName}`, {
                body: newMsg.content,
                tag: `chat-${orderId}`,
                requireInteraction: false
            });
        }
        
        setMessages(prev => {
            // Éviter les doublons (notamment pour l'expéditeur qui a déjà l'optimistic UI)
            const exists = prev.some(m => m.id === newMsg.id);
            if (exists) return prev;
            
            // On remplace le message optimiste correspondant s'il existe
            const optimisticIndex = prev.findIndex(m => 
                m.senderId === newMsg.senderId && 
                m.content === newMsg.content && 
                (m.id.startsWith('opt-') || m.id.length > 10)
            );
            
            if (optimisticIndex !== -1) {
                const newArr = [...prev];
                newArr[optimisticIndex] = newMsg;
                return newArr;
            }
            
            return [...prev, newMsg];
        });
        
        // If message is from other user, mark as read immediately since window is open
        if (newMsg.senderId !== currentUser.id) {
            markMessagesAsRead();
        }
        
        scrollToBottom();
      })
      .subscribe((status) => {
          console.log(`[Chat] Statut de la souscription Realtime: ${status}`);
          if (status === 'CHANNEL_ERROR') {
              console.error("[Chat] Erreur critique de connexion Realtime. Vérifiez si la table 'messages' a le Realtime activé dans Supabase.");
          }
      });

    // POLLING SECURE : Récupération en arrière-plan toutes les 4s pour garantir la livraison sans realtime actif
    const pollingInterval = setInterval(() => {
        fetchMessages(true);
    }, 4000);

    return () => {
      console.log(`[Chat] Fermeture du canal pour l'ordre: ${orderId}`);
      supabase.removeChannel(channel);
      clearInterval(pollingInterval);
    };
  }, [orderId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data) {
        setMessages(data.map((m: any) => ({
          id: m.id,
          orderId: m.order_id,
          senderId: m.sender_id,
          content: m.content,
          createdAt: m.created_at,
          isRead: m.is_read || false
        })));
      }
    } catch (err: any) {
      if (!silent) {
        console.warn("Erreur chargement messages (Mode démo possible)", err);
        
        const isUuidError = err.code === '22P02' || (err.message && err.message.includes('uuid'));
        if (isUuidError) {
          toast.error("Erreur de base de données détectée. Veuillez exécuter le script 'fix_messages_final.sql' dans Supabase.");
        }
      }
      
      // Demo fallback
      const local = localStorage.getItem(`chat_${orderId}`);
      if (local) setMessages(JSON.parse(local));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const markMessagesAsRead = async () => {
      if (!currentUser.id || !orderId || orderId.startsWith('mock-')) return;
      try {
          await supabase.from('messages')
            .update({ is_read: true })
            .eq('order_id', orderId)
            .neq('sender_id', currentUser.id)
            .eq('is_read', false);
      } catch (err) {
          console.error("Error marking messages as read", err);
      }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return; // Removed isSending check to allow rapid typing if needed, though we set it below

    const tempId = `opt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const content = newMessage.trim();
    setNewMessage(''); // Clear immediately
    setIsSending(true);

    const msgPayload: any = {
      order_id: orderId,
      sender_id: currentUser.id,
      content: content
    };

    const isValidUUID = (val: string): boolean => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    };

    if (otherUserId && otherUserId.length > 5) {
      if (isValidUUID(otherUserId)) {
        msgPayload.recipient_id = otherUserId;
      } else {
        console.warn(`[Chat] Omitting recipient_id "${otherUserId}" because it is not a valid UUID.`);
      }
    }

    // Optimistic UI update
    const optimisticMsg: Message = {
      id: tempId,
      orderId: orderId,
      senderId: currentUser.id,
      content: content,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    
    setMessages(prev => [...prev, optimisticMsg]);
    
    try {
      // Tenter l'envoi Supabase
      let { error } = await supabase.from('messages').insert(msgPayload);
      
      // Auto-healing fallback: si la colonne recipient_id n'existe pas dans la base de données
      if (error && (error.code === '42703' || error.message?.includes('recipient_id'))) {
        console.warn("[Chat] Colonne 'recipient_id' manquante dans la table 'messages'. Nouvelle tentative d'envoi sans ce champ...");
        const fallbackPayload = {
          order_id: msgPayload.order_id,
          sender_id: msgPayload.sender_id,
          content: msgPayload.content
        };
        const { error: retryError } = await supabase.from('messages').insert(fallbackPayload);
        error = retryError;
      }

      if (error) {
        console.warn("Échec insertion Supabase:", error);
        throw error;
      }

      // Recharger pour confirmer la synchronisation si possible
      // fetchMessages(); 

      // Insérer une notification pour le destinataire
      if (otherUserId && !orderId.startsWith('mock-')) {
        let notificationTitle = `Nouveau message`;
        if (orderId.startsWith('sub-')) {
          notificationTitle = `Message de ${currentUser.name || 'Utilisateur'}`;
          if (currentUser.role === 'delivery') {
            notificationTitle = `${currentUser.name || 'Livreur'}`;
          }
        } else if (currentUser.role === 'delivery') {
          if (otherUserRole === 'client' || otherUserRole === 'customer') {
            notificationTitle = `${currentUser.name || 'Livreur'}`;
          } else {
            notificationTitle = `Livreur: ${currentUser.name || 'Livreur'} (Cmd #${orderId.slice(0, 4)})`;
          }
        } else if (currentUser.role === 'client') {
          notificationTitle = `Client: ${currentUser.name || 'Client'} (Cmd #${orderId.slice(0, 4)})`;
        } else {
          notificationTitle = `${currentUser.name || 'Restaurant'} (Cmd #${orderId.slice(0, 4)})`;
        }

        await supabase.from('notifications').insert({
          user_id: otherUserId,
          restaurant_id: restaurantId,
          title: notificationTitle,
          message: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
          type: 'message',
          data: { order_id: orderId, chat: true }
        });
      }
    } catch (err: any) {
      console.error("Erreur envoi:", err);
      
      // Check for UUID type error (Postgres code 22P02)
      const isUuidError = err.code === '22P02' || (err.message && err.message.includes('uuid'));
      
      // Mark as local in state
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isLocal: true } : m));

      // Demo Mode Fallback
      const current = JSON.parse(localStorage.getItem(`chat_${orderId}`) || '[]');
      localStorage.setItem(`chat_${orderId}`, JSON.stringify([...current, { ...optimisticMsg, isLocal: true }]));
      
      if (isUuidError) {
        toast.error("Erreur de base de données : La colonne 'order_id' doit être de type TEXT. Veuillez exécuter le script 'fix_messages_final.sql' dans votre éditeur SQL Supabase pour activer le chat permanent.");
      } else {
        toast.error("Message non envoyé au serveur (Mode Démo / Hors-ligne détecté)");
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleCall = () => {
      if (otherUserPhone) {
          window.open(`tel:${otherUserPhone}`);
      } else {
          toast.error("Numéro de téléphone non disponible.");
      }
  };

  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      } else {
        setViewportHeight(window.innerHeight);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }
    
    handleResize();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" style={{ height: viewportHeight }}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="bg-white w-full h-full sm:w-[400px] sm:h-[600px] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-in-up relative z-10">
        
        {/* Header */}
        <div className="bg-brand-600 p-4 text-white flex justify-between items-center shadow-md z-10">
          <div className="flex items-center space-x-3">
             <div className="relative">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/30">
                   {currentUser.role === 'client' ? <Store size={20}/> : <User size={20}/>}
                </div>
                {/* Petit point vert style Facebook sur l'avatar du correspondant s'il est en ligne */}
                {isUserOnline(otherUserLastSeen) && (
                   <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-brand-600 rounded-full animate-bounce"></span>
                )}
             </div>
             <div>
                <h3 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                  {otherUserName}
                  {isUserOnline(otherUserLastSeen) && (
                    <span className="w-2 h-2 bg-green-400 rounded-full inline-block" title="En ligne"></span>
                  )}
                </h3>
                <p className="text-[10px] opacity-90 flex flex-col leading-tight mt-0.5">
                    <span className="font-medium text-white/90">
                      {isUserOnline(otherUserLastSeen) ? (
                        <span className="flex items-center text-green-300 font-bold">● En ligne</span>
                      ) : (
                        <span className="text-white/70 italic">{formatLastSeen(otherUserLastSeen)}</span>
                      )}
                    </span>
                    <span className="opacity-70 text-[9px]">
                      {orderId.startsWith('sub-') ? 'Discussion Abonné' : `Commande #${orderId.slice(0,4)}`}
                    </span>
                </p>
             </div>
          </div>
          <div className="flex items-center space-x-1">
             <button 
                onClick={handleCall} 
                disabled={!otherUserPhone}
                className={`p-2 rounded-full transition-colors ${otherUserPhone ? 'hover:bg-white/10 text-white' : 'text-white/40 cursor-not-allowed'}`}
             >
                <Phone size={20} />
             </button>
             <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
             </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 bg-gray-50 overflow-y-auto p-4 space-y-3" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                        <MessageSquare size={24} className="opacity-50"/>
                    </div>
                    <p>Commencez la discussion avec {otherUserName}.</p>
                </div>
            )}
            
            {messages.map((msg) => {
                const isMe = msg.senderId === currentUser.id;
                return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        {!isMe && (
                            <span className="text-[10px] text-gray-500 ml-2 mb-1">{otherUserName}</span>
                        )}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm relative ${
                            isMe 
                            ? 'bg-brand-500 text-white rounded-tr-none' 
                            : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                        }`}>
                            <p className="leading-relaxed">{msg.content}</p>
                        </div>
                        <div className="flex items-center space-x-1 mt-1 px-1">
                            <span className="text-[9px] text-gray-400">
                                {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                            {isMe && (
                                msg.isLocal ? (
                                    <span className="text-[9px] text-red-500 font-medium animate-pulse">
                                        Message non envoyé mais stocké localement
                                    </span>
                                ) : (
                                    msg.isRead ? <CheckCheck size={12} className="text-brand-500" /> : <Check size={12} className="text-gray-300" />
                                )
                            )}
                        </div>
                    </div>
                );
            })}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex items-center gap-2 pb-safe">
            <input 
                type="text" 
                className="flex-1 bg-gray-100 border-0 rounded-full px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all placeholder:text-gray-400"
                placeholder="Écrivez votre message..."
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
            />
            <button 
                type="submit" 
                disabled={!newMessage.trim() || isSending}
                className="bg-brand-600 text-white p-3 rounded-full hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-200 transition-all active:scale-95 flex-shrink-0"
            >
                {isSending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send size={18} className="ml-0.5" />}
            </button>
        </form>

      </div>
    </div>
  );
};