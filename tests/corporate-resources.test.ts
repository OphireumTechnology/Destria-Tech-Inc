import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createApp } from '../src/server/app';
import {
  CORPORATE_PROFILE_RESOURCE,
  CORPORATE_RESOURCES,
  CORPORATE_RESOURCES_SECTION_COPY,
  SERVICES_BROCHURE_PAGE_SUMMARIES,
  SERVICES_BROCHURE_RESOURCE,
  formatResourceFileSize,
  getPublishedCorporateResources,
} from '../src/data/corporateResources';
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
  containsUnauthorizedPriceDisclosure,
  formatTextForVoiceSpeech,
} from '../src/server/aiCommercialPolicy';

describe('DESTRIA TECH INC — Corporate Resources & Services Brochure Integration Suite', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    const { app } = createApp();
    // Mount public static directory just like production dist / Vite middleware
    app.use(express.static(path.resolve('public')));
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

  it('Actual unmodified 8-page Services Brochure PDF and 17-page Corporate Profile PDF exist with valid PDF headers and matching byte sizes', () => {
    const servicesPdfPath = path.resolve('public/resources/destria-tech-line-of-services.pdf');
    const sourceServicesPdfPath = path.resolve(
      'public/assets/aistudio/Destria_Tech_Inc_-_Line_of_Services_38b7e35c.pdf'
    );
    const profilePdfPath = path.resolve('public/documents/destria-tech-inc-corporate-profile.pdf');

    assert.ok(fs.existsSync(servicesPdfPath), 'Missing public/resources/destria-tech-line-of-services.pdf');
    assert.ok(fs.existsSync(profilePdfPath), 'Missing public/documents/destria-tech-inc-corporate-profile.pdf');

    const servicesBuf = fs.readFileSync(servicesPdfPath);
    const sourceBuf = fs.readFileSync(sourceServicesPdfPath);
    const profileBuf = fs.readFileSync(profilePdfPath);

    // Byte-for-byte fidelity with the attached PDF (never fabricated or altered)
    assert.equal(servicesBuf.length, sourceBuf.length);
    assert.equal(Buffer.compare(servicesBuf, sourceBuf), 0);
    assert.equal(servicesBuf.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.equal(profileBuf.subarray(0, 5).toString('ascii'), '%PDF-');

    // Centralized config byte counts match disk files exactly
    assert.equal(SERVICES_BROCHURE_RESOURCE.fileSizeBytes, servicesBuf.length);
    assert.equal(CORPORATE_PROFILE_RESOURCE.fileSizeBytes, profileBuf.length);
    assert.equal(SERVICES_BROCHURE_RESOURCE.pageCount, 8);
    assert.equal(CORPORATE_PROFILE_RESOURCE.pageCount, 17);
  });

  it('Genuine page-1 WebP cover thumbnails exist with valid RIFF/WEBP binary headers', () => {
    const servicesThumbPath = path.resolve(
      'public/resources/thumbnails/destria-tech-line-of-services-cover.webp'
    );
    const profileThumbPath = path.resolve('public/resources/thumbnails/corporate-profile-cover.webp');
    const brandingProfileThumbPath = path.resolve('public/branding/corporate-profile-cover.webp');

    for (const thumbPath of [servicesThumbPath, profileThumbPath, brandingProfileThumbPath]) {
      assert.ok(fs.existsSync(thumbPath), `Missing WebP cover thumbnail: ${thumbPath}`);
      const buf = fs.readFileSync(thumbPath);
      assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', `${thumbPath} must start with RIFF`);
      assert.equal(buf.subarray(8, 12).toString('ascii'), 'WEBP', `${thumbPath} must be WEBP`);
      assert.ok(buf.length > 10_000, `${thumbPath} should be a genuine rendered cover thumbnail`);
    }
  });

  it('Centralized corporateResources registry exposes approved metadata, download filenames, and zero public pricing', () => {
    const published = getPublishedCorporateResources();
    assert.equal(published.length, 2);
    assert.equal(CORPORATE_RESOURCES.length, 2);

    assert.equal(
      SERVICES_BROCHURE_RESOURCE.title,
      'Corporate Summary and Enterprise Technology Services'
    );
    assert.equal(SERVICES_BROCHURE_RESOURCE.category, 'Corporate Services & Capabilities');
    assert.equal(
      SERVICES_BROCHURE_RESOURCE.downloadFilename,
      'DESTRIA-TECH-INC-Corporate-Services-and-Capabilities.pdf'
    );
    assert.equal(
      SERVICES_BROCHURE_RESOURCE.canonicalFileUrl,
      'https://destriatech.com/resources/destria-tech-line-of-services.pdf'
    );
    assert.equal(SERVICES_BROCHURE_RESOURCE.format, 'PDF');
    assert.equal(SERVICES_BROCHURE_RESOURCE.isPublished, true);
    assert.equal(formatResourceFileSize(SERVICES_BROCHURE_RESOURCE.fileSizeBytes), '2.76 MB');
    assert.equal(formatResourceFileSize(CORPORATE_PROFILE_RESOURCE.fileSizeBytes), '6.38 MB');

    // Accessible HTML summaries cover all 9 service divisions + executive overview/approach/comms
    assert.ok(SERVICES_BROCHURE_PAGE_SUMMARIES.length >= 11);
    const serializedSummaries = JSON.stringify({
      CORPORATE_RESOURCES,
      SERVICES_BROCHURE_PAGE_SUMMARIES,
      CORPORATE_RESOURCES_SECTION_COPY,
    });
    assert.equal(
      containsUnauthorizedPriceDisclosure(serializedSummaries),
      false,
      'Corporate resources metadata and HTML summaries must never disclose public pricing'
    );
  });

  it('HTTP server delivers /resources/destria-tech-line-of-services.pdf and WebP cover with HTTP 200 and genuine MIME types', async () => {
    const pdfRes = await fetch(`${baseUrl}/resources/destria-tech-line-of-services.pdf`);
    assert.equal(pdfRes.status, 200);
    assert.match(pdfRes.headers.get('content-type') || '', /application\/pdf/i);
    const pdfArrayBuf = await pdfRes.arrayBuffer();
    const pdfBytes = Buffer.from(pdfArrayBuf);
    assert.equal(pdfBytes.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.equal(pdfBytes.length, SERVICES_BROCHURE_RESOURCE.fileSizeBytes);

    const profileRes = await fetch(`${baseUrl}/documents/destria-tech-inc-corporate-profile.pdf`);
    assert.equal(profileRes.status, 200);
    assert.match(profileRes.headers.get('content-type') || '', /application\/pdf/i);

    const thumbRes = await fetch(
      `${baseUrl}/resources/thumbnails/destria-tech-line-of-services-cover.webp`
    );
    assert.equal(thumbRes.status, 200);
    assert.match(thumbRes.headers.get('content-type') || '', /image\/webp/i);
  });

  it('Clean URL routing, SEO metadata, and sitemap include /resources cleanly without hash prefixes', () => {
    assert.equal(ROUTES.RESOURCES, '/resources');
    assert.ok(PUBLIC_STATIC_ROUTES.includes('/resources'));
    assert.ok(STATIC_ENTRY_ROUTES.includes('/resources'));
    assert.ok(PUBLIC_SITEMAP_ROUTES.includes('/resources'));
    assert.equal(isRecognizedInternalRoute('/resources'), true);
    assert.equal(normalizeRoutePathname('/resources/'), '/resources');
    assert.equal(normalizeRoutePathname('/Resources'), '/resources');

    const seo = getRouteSeoMeta('/resources');
    assert.equal(seo.title, 'Corporate Resources & Services Brochure | DESTRIA TECH INC');
    assert.equal(seo.canonicalUrl, 'https://destriatech.com/resources');
    assert.equal(
      seo.ogImage,
      'https://destriatech.com/resources/thumbnails/destria-tech-line-of-services-cover.webp'
    );
    assert.notEqual(seo.noIndex, true);

    const sitemap = fs.readFileSync(path.resolve('public/sitemap.xml'), 'utf8');
    assert.match(sitemap, /<loc>https:\/\/destriatech\.com\/resources<\/loc>/);
  });

  it('AI Consultant Chat and Voice endpoints return verified Services Brochure and Corporate Resources links without public pricing', async () => {
    const prompts = [
      'Can I download your services brochure?',
      'Do you have a service catalog or list of services?',
      'Please share your technology capabilities and corporate presentation.',
      'Where can I find your company information and corporate resources?',
    ];

    for (const prompt of prompts) {
      const policy = classifyCommercialPolicyIntent(prompt);
      assert.ok(policy.approvedResponse, `Policy should answer: "${prompt}"`);
      assert.equal(policy.isPricingRestricted, false);
      assert.equal(containsUnauthorizedPriceDisclosure(policy.approvedResponse || ''), false);
      assert.ok(
        Array.isArray(policy.resourceLinks) && policy.resourceLinks.length >= 2,
        `Expected verified resourceLinks for: "${prompt}"`
      );
      assert.ok(
        policy.resourceLinks.some(
          (r) => r.fileUrl === '/resources/destria-tech-line-of-services.pdf'
        )
      );
    }

    // Live POST /api/consultant/chat
    const chatRes = await fetch(`${baseUrl}/api/consultant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: 'Can I download your enterprise services brochure and capabilities catalog?',
        conversationHistory: [],
        stateContext: { currentStage: 'welcome' },
      }),
    });
    assert.equal(chatRes.status, 200);
    const chatData = await chatRes.json();
    assert.match(
      chatData.replyText,
      /https:\/\/destriatech\.com\/resources\/destria-tech-line-of-services\.pdf/
    );
    assert.equal(containsUnauthorizedPriceDisclosure(chatData.replyText), false);
    assert.ok(Array.isArray(chatData.resourceLinks) && chatData.resourceLinks.length === 2);

    // Live POST /api/voice/process
    const voiceRes = await fetch(`${baseUrl}/api/voice/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: 'Do you have a brochure or list of services I can download?',
        language: 'en-US',
        conversationHistory: [],
      }),
    });
    assert.equal(voiceRes.status, 200);
    const voiceData = await voiceRes.json();
    assert.match(voiceData.replyText, /destria-tech-line-of-services\.pdf/);
    assert.match(formatTextForVoiceSpeech(voiceData.replyText), /destriatech dot com slash resources/i);
    assert.ok(Array.isArray(voiceData.resourceLinks) && voiceData.resourceLinks.length === 2);
  });

  it('All 6 strategic website placements wire centralized corporate resources cleanly with zero secret or internal email leakage', () => {
    const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    const headerSrc = fs.readFileSync(path.resolve('src/components/Header.tsx'), 'utf8');
    const servicesSrc = fs.readFileSync(path.resolve('src/components/ServicesSection.tsx'), 'utf8');
    const aboutSrc = fs.readFileSync(path.resolve('src/components/AboutSection.tsx'), 'utf8');
    const footerSrc = fs.readFileSync(path.resolve('src/components/Footer.tsx'), 'utf8');
    const sectionSrc = fs.readFileSync(
      path.resolve('src/components/CorporateResourcesSection.tsx'),
      'utf8'
    );
    const pageSrc = fs.readFileSync(path.resolve('src/components/ResourcesPage.tsx'), 'utf8');

    // 1. Homepage placement before ContactSection + dedicated /resources route
    assert.match(appSrc, /<CorporateResourcesSection\s*\/>[\s\S]*<ContactSection/);
    assert.match(appSrc, /path=\{ROUTES\.RESOURCES\}/);

    // 2. Main navigation link
    assert.match(headerSrc, /label:\s*'Resources',\s*to:\s*ROUTES\.RESOURCES/);

    // 3. Solutions & Services CTA
    assert.match(servicesSrc, /Download Services Brochure/);
    assert.match(servicesSrc, /SERVICES_BROCHURE_RESOURCE/);

    // 4. About Us access to both documents
    assert.match(aboutSrc, /CORPORATE_PROFILE_RESOURCE/);
    assert.match(aboutSrc, /SERVICES_BROCHURE_RESOURCE/);

    // 5. Footer Corporate Resources link group
    assert.match(footerSrc, /Corporate Resources/);
    assert.match(footerSrc, /Services &amp; Capabilities/);
    assert.match(footerSrc, /Download Center/);

    // 6. CorporateResourcesSection avoids eager iframe/object embedding (lazy modal only)
    assert.doesNotMatch(sectionSrc, /<iframe|<object|<embed/i);
    assert.match(sectionSrc, /lazy\(\(\)\s*=>\s*import\('\.\/ResourcePdfModal'\)\)/);
    assert.match(pageSrc, /CollectionPage/);
    assert.match(pageSrc, /DigitalDocument/);

    // Zero hardcoded secrets or internal notification recipients in frontend UI files
    for (const src of [appSrc, headerSrc, servicesSrc, aboutSrc, footerSrc, sectionSrc, pageSrc]) {
      assert.doesNotMatch(src, /GEMINI_API_KEY|artaxsvcs@gmail\.com|dhenze\.languisan@gmail\.com/i);
    }
  });
});
