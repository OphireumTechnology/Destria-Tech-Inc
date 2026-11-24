import { BRAND_ASSETS } from './brandAssets';

export interface CorporateVerificationConfig {
  isVerified: boolean;
  statusLabel: string;
  registrationNo: string | null;
  jurisdiction: string | null;
  leadershipName: string | null;
}

export interface CompanyConfig {
  name: string;
  displayName: string;
  initials: string;
  platformName: string;
  /** Optional verified corporate contact details (configured via environment variables only) */
  corporateEmail: string | null;
  corporatePhone: string | null;
  corporatePhoneLink: string | null;
  registeredAddress: string | null;
  registeredAddressMapsUrl: string | null;
  verification: CorporateVerificationConfig;
  founderAndCeo: string;
  chiefTechnologyOfficer: string;
  headquartersAddress: string;
  logoUrl: string;
  brandBoardUrl: string;
  headline: string;
  subheadline: string;
  heroDescription: string;
  palette: {
    graphite: string;
    cyan: string;
    silverBg: string;
    gold: string;
    navy: string;
    techBlue: string;
    emeraldTeal: string;
    white: string;
  };
}

function readEnv(viteKey: string, nodeKey?: string): string | null {
  const fromVite =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as Record<string, string | undefined>)[viteKey]
      : undefined;
  const fromNode =
    typeof process !== 'undefined' && process.env
      ? process.env[nodeKey || viteKey]
      : undefined;
  const value = (fromVite || fromNode || '').trim();
  return value.length > 0 ? value : null;
}

const verifiedEmail = readEnv('VITE_CORPORATE_EMAIL', 'DESTRIA_CORPORATE_EMAIL');
const verifiedPhone = readEnv('VITE_CORPORATE_PHONE', 'DESTRIA_CORPORATE_PHONE');
const verifiedAddress = readEnv('VITE_CORPORATE_ADDRESS', 'DESTRIA_REGISTERED_ADDRESS');
const verifiedRegNo = readEnv('VITE_CORPORATE_REG_NO', 'DESTRIA_REGISTRATION_NO');
const verifiedJurisdiction = readEnv('VITE_CORPORATE_JURISDICTION', 'DESTRIA_JURISDICTION');
const verifiedLeadership = readEnv('VITE_CORPORATE_LEADERSHIP', 'DESTRIA_LEADERSHIP_NAME');

export const LOGO_URL = BRAND_ASSETS.primaryLogo;
export const BRAND_BOARD_URL = BRAND_ASSETS.brandBoard;

export const COMPANY_CONFIG: CompanyConfig = {
  name: 'DESTRIA TECH INC',
  displayName: 'Destria Tech Inc',
  initials: 'DTI',
  platformName: 'DESTRIA NETWORK',
  corporateEmail: 'info@destriatech.com',
  corporatePhone: verifiedPhone,
  corporatePhoneLink: verifiedPhone ? `tel:${verifiedPhone.replace(/[^+\d]/g, '')}` : null,
  registeredAddress: verifiedAddress,
  registeredAddressMapsUrl: verifiedAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(verifiedAddress)}` : null,
  verification: {
    isVerified: Boolean(verifiedRegNo),
    statusLabel: verifiedRegNo
      ? `Corporate Registration No. ${verifiedRegNo}`
      : 'Official Corporate Incorporation Records Maintained Upon Confirmation',
    registrationNo: verifiedRegNo,
    jurisdiction: 'Wyoming, United States of America',
    leadershipName: 'Desmond Hines — Founder & CEO',
  },
  founderAndCeo: 'Desmond Hines',
  chiefTechnologyOfficer: 'Leodenis Languisan',
  headquartersAddress: '30 N Gould St #6082, Sheridan, Sheridan County, WY 82801 USA',
  logoUrl: LOGO_URL,
  brandBoardUrl: BRAND_BOARD_URL,
  headline: 'DESTRIA TECH INC',
  subheadline: 'Engineering Intelligence. Connecting the Future.',
  heroDescription:
    'Enterprise technology engineering specializing in artificial intelligence, blockchain infrastructure, scalable software systems, cloud cybersecurity, digital modernization, and creative multimedia platforms.',
  palette: {
    graphite: '#111827',
    cyan: '#00C2C7',
    silverBg: '#F3F4F6',
    gold: '#D4AF37',
    navy: '#0B1F3B',
    techBlue: '#0EA5E9',
    emeraldTeal: '#10B981',
    white: '#FFFFFF',
  },
};
