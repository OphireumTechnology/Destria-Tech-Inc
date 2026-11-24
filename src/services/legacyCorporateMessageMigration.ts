import { COMPANY_CONFIG } from '../data/companyConfig';
import type { ChatMessage } from './aiConsultantService';

// Legacy aliases are recognized only when migrating assistant-generated content.
export function normalizeCorporateMessage(message: ChatMessage): ChatMessage {
  if (!message || message.sender !== 'ai') return message;
  const normalize = (value: string) => value
    .replace(/CEO (?:Dhenze|Leodenis) Languisan/gi, `CEO ${COMPANY_CONFIG.founderAndCeo}`)
    .replace(/Oph(?:ireum|erium) Multimedia Production/gi, COMPANY_CONFIG.name)
    .replace(/Ophireum Network/gi, COMPANY_CONFIG.platformName);
  return { ...message, text: normalize(message.text), quickReplies: message.quickReplies?.map(normalize) };
}
