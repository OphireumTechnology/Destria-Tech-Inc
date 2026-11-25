import React from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import { corporateIdentity } from '../../data/companyConfig';

interface ClientPortalContactInformationProps {
  /** Compact variant used below the authentication card on small screens */
  variant?: 'dark-panel' | 'mobile-light';
}

export const ClientPortalContactInformation: React.FC<ClientPortalContactInformationProps> = ({
  variant = 'dark-panel',
}) => {
  const hq = corporateIdentity.headquarters;
  const tel = corporateIdentity.contact.telephone;
  const email = corporateIdentity.contact.email;

  const addressLine1 = `${hq.suite} - ${hq.street}`;
  const addressLine2 = `${hq.city}, ${hq.county}, ${hq.state} ${hq.postalCode} ${hq.country}`;

  if (variant === 'mobile-light') {
    return (
      <section
        aria-label="Corporate contact information"
        className="mt-6 pt-5 border-t border-[#E2E8F0] text-[#475569] space-y-3"
      >
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold tracking-[0.04em] text-[#0B1F3B]">
            {corporateIdentity.legalName}
          </p>
          <p className="text-[11px] font-medium tracking-[0.08em] text-[#64748B]">
            {corporateIdentity.networkName}
          </p>
        </div>

        <div className="flex items-start gap-2.5 text-[12.5px] leading-[1.5]">
          <MapPin className="w-4 h-4 text-[#0B1F3B]/70 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B] mb-0.5">
              Corporate Headquarters
            </p>
            <p className="text-[#334155]">{addressLine1}</p>
            <p className="text-[#334155]">{addressLine2}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-5 pt-0.5 text-[13px]">
          <a
            href={tel.href}
            aria-label={`Call ${corporateIdentity.legalName} International Telephone ${tel.international}`}
            data-e164={tel.e164}
            className="inline-flex items-center gap-2 font-medium text-[#0B1F3B] hover:text-[#008C90] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3B] rounded"
          >
            <Phone className="w-4 h-4 text-[#008C90] shrink-0" aria-hidden="true" />
            <span>{tel.display}</span>
          </a>
          <a
            href={`mailto:${email}`}
            aria-label={`Email ${corporateIdentity.legalName} at ${email}`}
            className="inline-flex items-center gap-2 font-medium text-[#0B1F3B] hover:text-[#008C90] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3B] rounded"
          >
            <Mail className="w-4 h-4 text-[#008C90] shrink-0" aria-hidden="true" />
            <span>{email}</span>
          </a>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Corporate contact information"
      className="pt-6 border-t border-white/12 space-y-4"
    >
      <div className="flex items-center gap-2 text-[12px] tracking-[0.06em]">
        <span className="font-semibold text-white">{corporateIdentity.legalName}</span>
        <span className="text-slate-500" aria-hidden="true">
          ·
        </span>
        <span className="font-medium text-[#D4AF37]">{corporateIdentity.networkName}</span>
      </div>

      {/* Corporate Headquarters on two readable lines */}
      <div className="flex items-start gap-3">
        <MapPin className="w-4 h-4 text-[#00C2C7] shrink-0 mt-1" aria-hidden="true" />
        <div className="text-[13px] leading-[1.55]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-0.5">
            Corporate Headquarters
          </p>
          <p className="text-slate-200">{addressLine1}</p>
          <p className="text-slate-300">{addressLine2}</p>
        </div>
      </div>

      {/* International Telephone & Corporate Email with aligned icons */}
      <div className="space-y-2.5 pt-0.5">
        <div className="flex items-center gap-3">
          <Phone className="w-4 h-4 text-[#00C2C7] shrink-0" aria-hidden="true" />
          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              International Telephone
            </span>
            <a
              href={tel.href}
              aria-label={`Call ${corporateIdentity.legalName} at ${tel.international}`}
              data-international={tel.international}
              data-e164={tel.e164}
              className="font-medium text-white hover:text-[#00C2C7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] rounded whitespace-nowrap"
            >
              {tel.display}
            </a>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Mail className="w-4 h-4 text-[#00C2C7] shrink-0" aria-hidden="true" />
          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Corporate Email
            </span>
            <a
              href={`mailto:${email}`}
              aria-label={`Email ${corporateIdentity.legalName} at ${email}`}
              className="font-medium text-slate-200 hover:text-[#00C2C7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00C2C7] rounded"
            >
              {email}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClientPortalContactInformation;
