import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface EventDetails {
  id: string;
  title: string;
  date: Date;
  locationName: string; // From Territory or Address
  leaderName: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://campana-v4.app';

/**
 * Generates the WhatsApp copy for event invitation.
 * Includes emoticons and the unique RSVP link.
 */
export const generateEventInvitation = (event: EventDetails): string => {
  const formattedDate = format(event.date, "EEEE d 'de' MMMM", { locale: es });
  const formattedTime = format(event.date, 'h:mm a');
  
  const rsvpLink = `${BASE_URL}/rsvp/${event.id}?ref=${encodeURIComponent(event.leaderName)}`;

  return `🇨🇴 *Invitación Especial* 🇨🇴

Hola, quiero invitarte a una reunión importante con nuestro equipo:

📅 *Fecha:* ${formattedDate}
⏰ *Hora:* ${formattedTime}
📍 *Lugar:* ${event.locationName}
🗣️ *Tema:* ${event.title}

Por favor confirma tu asistencia aquí (es muy rápido):
👇👇👇
${rsvpLink}

¡Cuento contigo!
_${event.leaderName}_`;
};

/**
 * Encodes the message for a whatsapp click-to-chat link.
 */
export const getWhatsAppShareLink = (text: string): string => {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
};
