import { supabase } from '../lib/supabase';

/**
 * Compresse une image (ex: photo de preuve de paiement) via HTML5 Canvas.
 * Limite les dimensions à max 1200px et qualité JPEG 0.75.
 * Réduit la taille d'une photo de smartphone de 15 Mo à ~120 Ko.
 * Empêche le crash/redémarrage de l'application dû à la mémoire RAM sur mobile.
 */
export async function compressImage(file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.75): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Téléverse en toute sécurité une preuve de paiement (ou toute photo).
 * Ne plante JAMAIS l'application, gère la compression et le fallback local.
 */
export async function safeUploadPaymentProof(file: File, orderIdPrefix = 'proof'): Promise<string> {
  try {
    // 1. Compression obligatoire pour éviter le crash mémoire sur mobile
    const compressedBlob = await compressImage(file, 1200, 1200, 0.75);

    // Préparer un Base64 ultra léger comme secours immédiat
    const compressedDataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onloadend = () => res((r.result as string) || '');
      r.readAsDataURL(compressedBlob);
    });

    // 2. Tenter l'envoi vers Supabase Storage
    const fileExt = 'jpg';
    const fileName = `${orderIdPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    const filePath = `payment_proofs/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, compressedBlob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (!uploadError) {
        const { data } = supabase.storage.from('images').getPublicUrl(filePath);
        if (data?.publicUrl) {
          return data.publicUrl;
        }
      } else {
        console.warn("Supabase Storage upload error, using fallback DataURL:", uploadError.message);
      }
    } catch (storageErr) {
      console.warn("Supabase storage exception, using fallback DataURL:", storageErr);
    }

    // 3. Fallback : Base64 compresse (sécurisé pour localStorage et état)
    return compressedDataUrl;
  } catch (err) {
    console.error("Erreur critique lors du traitement de la preuve:", err);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.readAsDataURL(file);
    });
  }
}
