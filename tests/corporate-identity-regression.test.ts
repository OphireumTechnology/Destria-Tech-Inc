import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  COMPANY_CONFIG,
  corporateIdentity,
  executiveLeadership,
} from '../src/data/companyConfig.ts';
import {
  CORPORATE_PROFILE_RESOURCE,
  CORPORATE_RESOURCES,
  SERVICES_BROCHURE_RESOURCE,
  formatResourceFileSize,
} from '../src/data/corporateResources.ts';
import {
  CORPORATE_PROFILE_HIGHLIGHTS,
  corporateProfile,
} from '../src/config/corporateProfile.ts';
import {
  CORPORATE_KNOWLEDGE_BASE,
  retrieveCorporateKnowledge,
} from '../src/data/corporateKnowledgeBase.ts';
import {
  APPROVED_AI_RESPONSES,
  MANDATORY_AI_SYSTEM_INSTRUCTION,
  classifyCommercialPolicyIntent,
  formatTextForVoiceSpeech,
} from '../src/server/aiCommercialPolicy.ts';
import { createApp } from '../src/server/app.ts';

/**
 * Recursively collect files under a directory matching allowed extensions.
 */
function collectFiles(dir: string, exts: Set<string>, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      collectFiles(full, exts, out);
    } else if (exts.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

test('1. Centralized executiveLeadership & corporateIdentity reflect official DESTRIA TECH INC records', () => {
  assert.equal(executiveLeadership.founderAndCEO.fullName, 'Desmond Hinds');
  assert.equal(executiveLeadership.founderAndCEO.title, 'Founder & Chief Executive Officer');
  assert.equal(executiveLeadership.founderAndCEO.organization, 'DESTRIA TECH INC');

  assert.equal(executiveLeadership.chiefTechnologyOfficer.fullName, 'Leodenis Languisan');
  assert.equal(executiveLeadership.chiefTechnologyOfficer.title, 'Chief Technology Officer');
  assert.equal(executiveLeadership.chiefTechnologyOfficer.organization, 'DESTRIA TECH INC');

  assert.equal(corporateIdentity.legalName, 'DESTRIA TECH INC');
  assert.equal(corporateIdentity.networkName, 'DESTRIA NETWORK');
  assert.equal(corporateIdentity.abbreviation, 'DTI');
  assert.equal(corporateIdentity.leadership.ceo.name, 'Desmond Hinds');
  assert.equal(corporateIdentity.leadership.ceo.title, 'Founder & Chief Executive Officer');
  assert.equal(corporateIdentity.leadership.cto.name, 'Leodenis Languisan');
  assert.equal(corporateIdentity.contact.telephone.display, '+1 (307) 419-4277');
  assert.equal(corporateIdentity.contact.email, 'info@destriatech.com');
  assert.equal(corporateIdentity.contact.website, 'https://destriatech.com/');
  assert.equal(
    COMPANY_CONFIG.headline,
    'Engineering Intelligent Solutions. Empowering Enterprise Transformation.'
  );
  assert.equal(COMPANY_CONFIG.palette.graphiteDark, '#111827');
  assert.equal(COMPANY_CONFIG.palette.deepNavy, '#0B1F3B');
  assert.equal(COMPANY_CONFIG.palette.technologyCyan, '#00C2C7');
  assert.equal(COMPANY_CONFIG.palette.metallicGold, '#D4AF37');
  assert.equal(COMPANY_CONFIG.palette.lightSilverBg, '#F3F4F6');
  assert.equal(COMPANY_CONFIG.palette.techBlue, '#0EA5E9');
  assert.equal(COMPANY_CONFIG.palette.emeraldTeal, '#10B981');
  assert.equal(COMPANY_CONFIG.palette.pureWhite, '#FFFFFF');
});

test('2. Active application source, metadata, and operational docs contain zero unauthorized "Desmond Hines" references', () => {
  const activeFiles = [
    ...collectFiles(path.resolve('src'), new Set(['.ts', '.tsx', '.js', '.json', '.css'])),
    path.resolve('index.html'),
    path.resolve('docs/deployment/release-readiness.md'),
    path.resolve('walkthrough.md'),
  ];

  // aiCommercialPolicy.ts intentionally matches legacy user/model spelling "desmond hines"
  // only to detect and sanitize it into "Desmond Hinds".
  const allowedSanitizerPath = path.resolve('src/server/aiCommercialPolicy.ts');

  const violations: string[] = [];
  for (const filePath of activeFiles) {
    if (filePath === allowedSanitizerPath) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (/desmond\s+hines/i.test(content)) {
      violations.push(path.relative(process.cwd(), filePath));
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found unauthorized "Desmond Hines" references in active files: ${violations.join(', ')}`
  );

  // Verify index.html Schema.org JSON-LD includes Desmond Hinds as founder
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  assert.match(indexHtml, /"name":\s*"Desmond Hinds"/);
  assert.doesNotMatch(indexHtml, /Desmond\s+Hines/i);

  // Verify Corporate Profile highlights and knowledge base reference Desmond Hinds
  assert.ok(
    CORPORATE_PROFILE_HIGHLIGHTS.some((h) => h.summary.includes('Desmond Hinds')),
    'Corporate Profile highlights must reference Desmond Hinds'
  );
  const ceoKbHits = retrieveCorporateKnowledge('Who is Desmond Hinds founder CEO?', { topK: 3 });
  assert.ok(ceoKbHits.length > 0);
  assert.ok(
    CORPORATE_KNOWLEDGE_BASE.some(
      (entry) =>
        entry.summary.includes('Desmond Hinds') ||
        entry.facts.some((fact) => fact.includes('Desmond Hinds'))
    ),
    'Corporate Knowledge Base must reference Desmond Hinds'
  );
});

test('3. AI Chat, Voice Assistant, and legacy-input sanitization consistently return Desmond Hinds', async () => {
  // System instruction & approved responses
  assert.match(MANDATORY_AI_SYSTEM_INSTRUCTION, /Desmond Hinds/);
  assert.doesNotMatch(MANDATORY_AI_SYSTEM_INSTRUCTION, /Desmond\s+Hines/i);
  assert.match(APPROVED_AI_RESPONSES.ceo, /Desmond Hinds/);
  assert.match(APPROVED_AI_RESPONSES.corporateProfile, /Desmond Hinds/);
  assert.doesNotMatch(JSON.stringify(APPROVED_AI_RESPONSES), /Desmond\s+Hines/i);

  // Voice speech sanitizer fixes legacy spelling if ever encountered
  assert.equal(
    formatTextForVoiceSpeech('Founder and CEO Desmond Hines leads DESTRIA TECH INC.'),
    'Founder and CEO Desmond Hinds leads DESTRIA TECH INC.'
  );

  // Asking with either spelling routes to authoritative Desmond Hinds response
  const legacyQueryPolicy = classifyCommercialPolicyIntent('Is Desmond Hines the CEO?');
  assert.equal(legacyQueryPolicy.trigger, 'ceo');
  assert.match(legacyQueryPolicy.approvedResponse || '', /Desmond Hinds/);
  assert.doesNotMatch(legacyQueryPolicy.approvedResponse || '', /Desmond\s+Hines/i);

  // Live Express app verification for Chat & Voice routes
  const { app } = createApp({ geminiClient: null });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    for (const query of [
      'Who is the Founder and CEO of DESTRIA TECH INC?',
      'Tell me about Desmond Hinds.',
      'Who is Desmond Hines?',
    ]) {
      const chatRes = await fetch(`${baseUrl}/api/consultant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: query }),
      });
      assert.equal(chatRes.status, 200);
      const chatBody = await chatRes.json();
      assert.match(chatBody.replyText, /Desmond Hinds/);
      assert.doesNotMatch(chatBody.replyText, /Desmond\s+Hines/i);

      const voiceRes = await fetch(`${baseUrl}/api/voice/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: query }),
      });
      assert.equal(voiceRes.status, 200);
      const voiceBody = await voiceRes.json();
      assert.match(voiceBody.replyText, /Desmond Hinds/);
      assert.doesNotMatch(voiceBody.replyText, /Desmond\s+Hines/i);
      assert.match(voiceBody.spokenText, /Desmond Hinds/);
      assert.doesNotMatch(voiceBody.spokenText, /Desmond\s+Hines/i);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('4. Modernized Corporate Resources PDFs, UI components, and SQL migration 006 satisfy enterprise invariants', () => {
  // Verify both PDFs exist, start with %PDF-, and match exact registered byte counts
  const profilePath = path.resolve('public/documents/destria-tech-inc-corporate-profile.pdf');
  const mirroredProfilePath = path.resolve('public/assets/aistudio/Corporate_Profile_5894b80c.pdf');
  const brochurePath = path.resolve('public/resources/destria-tech-line-of-services.pdf');

  const profileBytes = fs.readFileSync(profilePath);
  const mirroredProfileBytes = fs.readFileSync(mirroredProfilePath);
  const brochureBytes = fs.readFileSync(brochurePath);

  assert.equal(profileBytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(brochureBytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(profileBytes.length, CORPORATE_PROFILE_RESOURCE.fileSizeBytes);
  assert.equal(profileBytes.length, corporateProfile.verifiedFileSizeBytes);
  assert.equal(mirroredProfileBytes.length, profileBytes.length);
  assert.equal(brochureBytes.length, SERVICES_BROCHURE_RESOURCE.fileSizeBytes);
  assert.equal(formatResourceFileSize(CORPORATE_PROFILE_RESOURCE.fileSizeBytes), '6.67 MB');
  assert.equal(formatResourceFileSize(SERVICES_BROCHURE_RESOURCE.fileSizeBytes), '2.76 MB');

  // Verify both resources expose 8 structured highlights
  assert.equal(CORPORATE_RESOURCES.length, 2);
  assert.equal(SERVICES_BROCHURE_RESOURCE.highlights.length, 8);
  assert.equal(CORPORATE_PROFILE_RESOURCE.highlights.length, 8);

  // Verify modernized UI architecture & accessibility invariants
  const sectionSrc = fs.readFileSync(path.resolve('src/components/CorporateResourcesSection.tsx'), 'utf8');
  const cardSrc = fs.readFileSync(path.resolve('src/components/resources/CorporateResourceCard.tsx'), 'utf8');
  const bgSrc = fs.readFileSync(
    path.resolve('src/components/animations/CorporateResourcesTechBackground.tsx'),
    'utf8'
  );
  const pageSrc = fs.readFileSync(path.resolve('src/components/ResourcesPage.tsx'), 'utf8');

  assert.match(sectionSrc, /#111827/);
  assert.match(sectionSrc, /CorporateResourcesTechBackground/);
  assert.match(sectionSrc, /CorporateResourceCard/);
  assert.match(sectionSrc, /Transform Your Enterprise with Intelligent Technology/);
  assert.match(sectionSrc, /Request an Enterprise Consultation/);
  assert.match(sectionSrc, /Explore Our Technology Solutions/);
  assert.match(sectionSrc, /Explore Download Center/);
  assert.match(sectionSrc, /lazy\(\(\) => import\('\.\/ResourcePdfModal'\)\)/);
  assert.doesNotMatch(sectionSrc, /<iframe|<object|<embed/i);

  assert.match(cardSrc, /Download PDF/);
  assert.match(cardSrc, /View PDF/);
  assert.match(cardSrc, /Preview Document/);
  assert.match(cardSrc, /role="alert"/);
  assert.match(bgSrc, /prefers-reduced-motion: reduce/);
  assert.match(bgSrc, /TechBackgroundErrorBoundary/);
  assert.match(pageSrc, /CollectionPage/);
  assert.match(pageSrc, /DigitalDocument/);
  assert.match(pageSrc, /executiveLeadership\.founderAndCEO\.fullName/);

  // Verify narrowly scoped transactional SQL migration 006 exists
  const migrationSql = fs.readFileSync(
    path.resolve('supabase/migrations/006_ceo_identity_correction.sql'),
    'utf8'
  );
  assert.match(migrationSql, /BEGIN;/);
  assert.match(migrationSql, /COMMIT;/);
  assert.match(migrationSql, /Desmond Hinds/);
  assert.match(migrationSql, /ROLLBACK/i);
});
