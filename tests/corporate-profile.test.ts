import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/server/app';
import {
  CORPORATE_PROFILE_HIGHLIGHTS,
  corporateProfile,
  formatCorporateProfileFileSize,
  getCorporateProfileMetaSummary,
} from '../src/config/corporateProfile';
import {
  PUBLIC_SITEMAP_ROUTES,
  PUBLIC_STATIC_ROUTES,
  ROUTES,
  STATIC_ENTRY_ROUTES,
  getRouteSeoMeta,
  isRecognizedInternalRoute,
  normalizeRoutePathname,
} from '../src/config/routes';
import {
  classifyCommercialPolicyIntent,
  formatTextForVoiceSpeech,
} from '../src/server/aiCommercialPolicy';

describe('DESTRIA TECH INC — Official Corporate Profile Integration Suite', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    const { app } = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('Centralized corporateProfile config defines approved paths, filename, public access, and 18 content highlights', () => {
    assert.equal(corporateProfile.companyName, 'DESTRIA TECH INC');
    assert.equal(corporateProfile.networkName, 'DESTRIA NETWORK');
    assert.equal(corporateProfile.abbreviation, 'DTI');
    assert.equal(corporateProfile.title, 'Corporate Profile');
    assert.equal(corporateProfile.pageCount, 17);
    assert.equal(corporateProfile.pagePath, '/corporate-profile');
    assert.equal(corporateProfile.documentPath, '/documents/destria-tech-inc-corporate-profile.pdf');
    assert.equal(corporateProfile.coverPath, '/branding/corporate-profile-cover.webp');
    assert.equal(corporateProfile.downloadFilename, 'DESTRIA-TECH-INC-Corporate-Profile.pdf');
    assert.equal(corporateProfile.publicAccess, true);
    assert.equal(corporateProfile.authenticationRequired, false);
    assert.equal(corporateProfile.paymentRequired, false);
    assert.equal(corporateProfile.canonicalPageUrl, 'https://destriatech.com/corporate-profile');
    assert.equal(
      corporateProfile.canonicalDocumentUrl,
      'https://destriatech.com/documents/destria-tech-inc-corporate-profile.pdf'
    );

    assert.equal(CORPORATE_PROFILE_HIGHLIGHTS.length, 18);
    assert.equal(CORPORATE_PROFILE_HIGHLIGHTS[0].title, 'Executive Corporate Overview');
    assert.equal(CORPORATE_PROFILE_HIGHLIGHTS[17].title, 'Official Corporate Communications');

    assert.equal(formatCorporateProfileFileSize(2 * 1024 * 1024), '2.00 MB');
    assert.equal(formatCorporateProfileFileSize(850 * 1024), '850 KB');
    assert.equal(formatCorporateProfileFileSize(null), null);
    assert.equal(getCorporateProfileMetaSummary(), 'PDF Document | 17 Pages | 6.67 MB | Free Download');
    assert.equal(
      getCorporateProfileMetaSummary(3.5 * 1024 * 1024),
      'PDF Document | 17 Pages | 3.50 MB | Free Download'
    );
  });

  it('Clean URL routing, SEO metadata, and sitemap cover /corporate-profile cleanly without hash routing', () => {
    assert.equal(ROUTES.CORPORATE_PROFILE, '/corporate-profile');
    assert.ok(PUBLIC_STATIC_ROUTES.includes('/corporate-profile'));
    assert.ok(STATIC_ENTRY_ROUTES.includes('/corporate-profile'));
    assert.ok(PUBLIC_SITEMAP_ROUTES.includes('/corporate-profile'));
    assert.equal(isRecognizedInternalRoute('/corporate-profile'), true);
    assert.equal(normalizeRoutePathname('/corporate-profile/'), '/corporate-profile');
    assert.equal(normalizeRoutePathname('/Corporate-Profile'), '/corporate-profile');

    const seo = getRouteSeoMeta('/corporate-profile');
    assert.equal(seo.title, 'Corporate Profile | DESTRIA TECH INC');
    assert.equal(
      seo.description,
      'View and download the official DESTRIA TECH INC Corporate Profile. Explore our enterprise technology solutions, corporate leadership, governance and digital innovation capabilities.'
    );
    assert.equal(seo.canonicalUrl, 'https://destriatech.com/corporate-profile');
    assert.equal(seo.ogImage, 'https://destriatech.com/branding/corporate-profile-cover.webp');
    assert.notEqual(seo.noIndex, true);

    const sitemap = fs.readFileSync(path.resolve('public/sitemap.xml'), 'utf8');
    assert.match(sitemap, /<loc>https:\/\/destriatech\.com\/corporate-profile<\/loc>/);
  });

  it('AI Consultant Chat and Voice endpoints return official Corporate Profile link and spoken cadence', async () => {
    // Policy engine classification
    const classification = classifyCommercialPolicyIntent('Where can I download your corporate profile?');
    assert.equal(classification.trigger, 'corporate_profile');
    assert.equal(classification.suggestedAction, 'corporate_profile');
    assert.match(
      classification.approvedResponse || '',
      /https:\/\/destriatech\.com\/corporate-profile/
    );

    // Voice TTS spoken cadence formatting
    const spoken = formatTextForVoiceSpeech(classification.approvedResponse || '');
    assert.match(spoken, /destriatech dot com slash corporate dash profile/i);

    // Live POST /api/consultant/chat
    const chatRes = await fetch(`${baseUrl}/api/consultant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: 'Can I get your official corporate profile PDF?',
        conversationHistory: [],
        stateContext: { currentStage: 'welcome' },
      }),
    });
    assert.equal(chatRes.status, 200);
    const chatData = await chatRes.json();
    assert.match(chatData.replyText, /https:\/\/destriatech\.com\/corporate-profile/);
    assert.equal(chatData.suggestedAction, 'corporate_profile');

    // Live POST /api/voice/process
    const voiceRes = await fetch(`${baseUrl}/api/voice/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: 'Please share your company background and corporate profile.',
        language: 'en-US',
        conversationHistory: [],
      }),
    });
    assert.equal(voiceRes.status, 200);
    const voiceData = await voiceRes.json();
    assert.match(voiceData.replyText, /https:\/\/destriatech\.com\/corporate-profile/);
    assert.match(voiceData.spokenText, /corporate dash profile/i);
  });

  it('Pricing guardrail still takes strict precedence over corporate profile mentions', () => {
    const pricingCheck = classifyCommercialPolicyIntent(
      'What are your prices in your corporate profile?'
    );
    assert.equal(pricingCheck.isPricingRestricted, true);
    assert.doesNotMatch(pricingCheck.approvedResponse || '', /\$\d/);
  });

  it('All UI surfaces wire centralized corporateProfile config without duplicating hardcoded PDF paths or leaking secrets', () => {
    const componentFiles = [
      'src/components/Hero.tsx',
      'src/components/AboutSection.tsx',
      'src/components/CorporateProfileSection.tsx',
      'src/components/CorporateProfilePage.tsx',
      'src/components/Header.tsx',
      'src/components/Footer.tsx',
      'src/components/consultant/AIConsultantWidget.tsx',
    ];

    for (const rel of componentFiles) {
      const content = fs.readFileSync(path.resolve(rel), 'utf8');
      assert.match(
        content,
        /corporateProfile|CORPORATE_PROFILE_RESOURCE|corporateResources|CORPORATE_PROFILE_DATA|corporate_profile|ROUTES\.RESOURCES/,
        `${rel} must reference centralized corporate profile or resources config`
      );
      assert.doesNotMatch(
        content,
        /\/documents\/destria-tech-inc-corporate-profile\.pdf/,
        `${rel} must not duplicate hardcoded document paths`
      );
      assert.doesNotMatch(content, /GEMINI_API_KEY|artaxsvcs@gmail\.com|dhenze\.languisan@gmail\.com/i);
    }

    // Verify homepage CorporateProfileSection does NOT embed an iframe/object PDF loader
    const sectionSrc = fs.readFileSync(path.resolve('src/components/CorporateProfileSection.tsx'), 'utf8');
    assert.doesNotMatch(sectionSrc, /<iframe|<object|<embed/i);

    // Verify dedicated CorporateProfilePage includes official corporate contact details & fallback
    const pageSrc = fs.readFileSync(path.resolve('src/components/CorporateProfilePage.tsx'), 'utf8');
    assert.match(pageSrc, /type="application\/pdf"/);
    assert.match(pageSrc, /corporateIdentity\.contact\.telephone/);
    assert.match(pageSrc, /corporateIdentity\.contact\.email/);
    assert.match(pageSrc, /SUITE 6082 - 30 N Gould St #6082/);
  });
});
