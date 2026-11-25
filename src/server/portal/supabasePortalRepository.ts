import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DatabaseUnavailableError } from '../db/types';
import { LocalPortalRepository } from './localPortalRepository';
import {
  ApprovedProposalRecord,
  ClientActivityLogRecord,
  ClientAddressRecord,
  CustomPackageInquiryRecord,
  FileScanStatus,
  NotificationRecord,
  OrderRecord,
  PaymentProviderId,
  PaymentRecord,
  PaymentRefundRecord,
  PaymentStatus,
  PortalCurrency,
  PortalProfileRecord,
  PortalRepository,
  PortalSessionRecord,
  PortalUserRecord,
  ProductCategoryRecord,
  ProductRecord,
  ProjectAttachmentRecord,
  USD_TO_PHP_REFERENCE_RATE,
} from './types';

function mapAuthUserRow(row: any): PortalUserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    emailVerified: Boolean(row.email_verified),
    verificationTokenHash: row.email_verification_token_hash || undefined,
    verificationTokenExpiresAt: row.email_verification_expires_at || undefined,
    resetTokenHash: row.password_reset_token_hash || undefined,
    resetTokenExpiresAt: row.password_reset_expires_at || undefined,
    pendingEmail: row.pending_email || undefined,
    pendingEmailTokenHash: row.pending_email_token_hash || undefined,
    pendingEmailTokenExpiresAt: row.pending_email_expires_at || undefined,
    accountStatus:
      row.account_status === 'pending_closure'
        ? 'pending_closure'
        : row.account_status === 'suspended'
        ? 'closed'
        : 'active',
    closureRequestedAt: row.closure_requested_at || undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at || row.created_at),
  };
}

function mapSessionRow(row: any): PortalSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    userAgent: String(row.user_agent || 'Browser'),
    ipAddress: String(row.ip_address || 'unknown'),
    createdAt: String(row.created_at),
    lastSeenAt: String(row.last_active_at || row.created_at),
    expiresAt: String(row.expires_at),
    revokedAt: row.revoked_at || undefined,
  };
}

function mapProfileRow(row: any, fallbackEmail = ''): PortalProfileRecord {
  const now = new Date().toISOString();
  const prefs =
    row.notification_preferences && typeof row.notification_preferences === 'object'
      ? row.notification_preferences
      : row.communication_preferences && typeof row.communication_preferences === 'object'
      ? row.communication_preferences
      : {};
  return {
    id: String(row.id || row.user_id),
    userId: String(row.user_id),
    email: String(row.email || fallbackEmail),
    firstName: String(row.first_name || ''),
    lastName: String(row.last_name || ''),
    fullName: String(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim()),
    phone: String(row.phone || ''),
    companyName: String(row.company_name || ''),
    taxId: String(row.tax_id || ''),
    avatarUrl: String(row.avatar_url || ''),
    timezone: String(row.timezone || 'America/Denver'),
    preferredCurrency: row.preferred_currency === 'PHP' ? 'PHP' : 'USD',
    notificationPreferences: {
      emailOrders: prefs.emailOrders ?? prefs.emailOrderUpdates ?? true,
      emailProjects: prefs.emailProjects ?? prefs.emailProjectMessages ?? true,
      emailMessages: prefs.emailMessages ?? prefs.emailProjectMessages ?? true,
      emailBilling: prefs.emailBilling ?? true,
      inAppAll: prefs.inAppAll ?? prefs.inAppNotifications ?? true,
    },
    createdAt: String(row.created_at || now),
    updatedAt: String(row.updated_at || row.created_at || now),
  };
}

/**
 * Fail-closed portal repository used in production when Supabase PostgreSQL
 * credentials are absent. Guarantees the server never silently persists client
 * accounts, orders, or files to volatile container memory.
 */
export class UnconfiguredPortalRepository implements PortalRepository {
  public readonly mode = 'unconfigured' as const;

  private fail(): never {
    throw new DatabaseUnavailableError(
      'Client Portal durable persistence (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) is not configured in production.'
    );
  }

  async findUserByEmail() { return this.fail(); }
  async findUserById() { return this.fail(); }
  async createUser() { return this.fail(); }
  async verifyEmailByTokenHash() { return this.fail(); }
  async setVerificationToken() { return this.fail(); }
  async setResetToken() { return this.fail(); }
  async resetPasswordByTokenHash() { return this.fail(); }
  async updatePassword() { return this.fail(); }
  async requestEmailChange() { return this.fail(); }
  async confirmEmailChange() { return this.fail(); }
  async requestAccountClosure() { return this.fail(); }

  async createSession() { return this.fail(); }
  async findActiveSessionByTokenHash() { return this.fail(); }
  async listUserSessions() { return this.fail(); }
  async revokeSessionById() { return this.fail(); }
  async revokeSessionByTokenHash() { return this.fail(); }
  async revokeOtherUserSessions() { return this.fail(); }
  async revokeAllUserSessions() { return this.fail(); }

  async getProfile() { return this.fail(); }
  async updateProfile() { return this.fail(); }
  async listAddresses() { return this.fail(); }
  async upsertAddress() { return this.fail(); }
  async deleteAddress() { return this.fail(); }

  async listCategories() { return this.fail(); }
  async listProducts() { return this.fail(); }
  async getProductBySlug() { return this.fail(); }
  async getPackageById() { return this.fail(); }
  async getDiscountCode() { return this.fail(); }
  async createCustomInquiry() { return this.fail(); }
  async listCustomInquiries() { return this.fail(); }

  async createApprovedProposal() { return this.fail(); }
  async listApprovedProposals() { return this.fail(); }
  async getApprovedProposalById() { return this.fail(); }
  async markProposalAccepted() { return this.fail(); }

  async getCart() { return this.fail(); }
  async saveCart() { return this.fail(); }

  async findOrderByIdempotencyKey() { return this.fail(); }
  async createOrder() { return this.fail(); }
  async listOrders() { return this.fail(); }
  async getOrderById() { return this.fail(); }
  async getOrderByIdInternal() { return this.fail(); }
  async requestOrderCancellation() { return this.fail(); }
  async listPayments() { return this.fail(); }
  async listInvoices() { return this.fail(); }
  async getInvoiceById() { return this.fail(); }
  async recordWebhookAndConfirmPayment() { return this.fail(); }

  async getWallet() { return this.fail(); }
  async listCreditTransactions() { return this.fail(); }
  async applyCreditLedgerEntry() { return this.fail(); }

  async listSubscriptions() { return this.fail(); }
  async requestSubscriptionCancel() { return this.fail(); }

  async createProject() { return this.fail(); }
  async listProjects() { return this.fail(); }
  async getProjectDetail() { return this.fail(); }
  async addProjectMessage() { return this.fail(); }
  async markProjectMessagesRead() { return this.fail(); }
  async listAllUserMessages() { return this.fail(); }
  async createRevisionRequest() { return this.fail(); }
  async approveDeliverable() { return this.fail(); }

  async saveAttachment() { return this.fail(); }
  async listAttachments() { return this.fail(); }
  async getAttachmentById() { return this.fail(); }

  async createSupportTicket() { return this.fail(); }
  async listSupportTickets() { return this.fail(); }
  async replySupportTicket() { return this.fail(); }

  async listNotifications() { return this.fail(); }
  async markNotificationRead() { return this.fail(); }
  async markAllNotificationsRead() { return this.fail(); }
  async addNotification() { return this.fail(); }
  async listActivities() { return this.fail(); }
  async addActivity() { return this.fail(); }
}

/**
 * Supabase PostgreSQL + Private Storage Portal Repository.
 * Uses parameterized Supabase queries against migrations 002 & 003 for durable
 * client auth, sessions, profiles, addresses, inquiries, proposals, files,
 * support tickets, notifications, and activity logs. Never silently swallows
 * write failures into volatile local memory.
 */
export class SupabasePortalRepository extends LocalPortalRepository {
  public override readonly mode: PortalRepository['mode'] = 'supabase';
  private readonly client: SupabaseClient;
  private readonly storageBucket: string;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    super({ persistDir: null });
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.storageBucket = (process.env.PORTAL_STORAGE_BUCKET || 'portal-private-files').trim();
  }

  private assertDbOk(error: { message: string } | null, context: string): void {
    if (error) {
      throw new DatabaseUnavailableError(`Supabase portal persistence error (${context}): ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Durable Portal Auth & Sessions (Migration 003: portal_auth_users, portal_sessions)
  // -------------------------------------------------------------------------
  public override async findUserByEmail(email: string): Promise<PortalUserRecord | null> {
    const { data, error } = await this.client
      .from('portal_auth_users')
      .select('*')
      .ilike('email', email.trim().toLowerCase())
      .maybeSingle();
    this.assertDbOk(error, 'findUserByEmail');
    return data ? mapAuthUserRow(data) : null;
  }

  public override async findUserById(userId: string): Promise<PortalUserRecord | null> {
    const { data, error } = await this.client
      .from('portal_auth_users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    this.assertDbOk(error, 'findUserById');
    return data ? mapAuthUserRow(data) : null;
  }

  public override async createUser(input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    companyName?: string;
    phone?: string;
    verificationTokenHash: string;
    verificationTokenExpiresAt?: string;
  }): Promise<{ user: PortalUserRecord; profile: PortalProfileRecord }> {
    const now = new Date().toISOString();
    const { data: userRow, error: userErr } = await this.client
      .from('portal_auth_users')
      .insert({
        email: input.email.trim().toLowerCase(),
        password_hash: input.passwordHash,
        role: 'client',
        email_verified: false,
        email_verification_token_hash: input.verificationTokenHash,
        email_verification_expires_at: input.verificationTokenExpiresAt,
        account_status: 'active',
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();
    this.assertDbOk(userErr, 'createUser');

    const user = mapAuthUserRow(userRow);
    const fullName = `${input.firstName} ${input.lastName}`.trim() || input.firstName;
    const { data: profileRow, error: profileErr } = await this.client
      .from('client_profiles')
      .upsert(
        {
          user_id: user.id,
          first_name: input.firstName,
          last_name: input.lastName,
          full_name: fullName,
          company_name: input.companyName || '',
          phone: input.phone || '',
          country: 'United States',
          timezone: 'America/Denver',
          preferred_currency: 'USD',
          preferred_language: 'en-US',
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();
    this.assertDbOk(profileErr, 'createUser.profile');

    await this.client
      .from('credit_wallets')
      .upsert(
        {
          user_id: user.id,
          available_credits: 0,
          used_credits: 0,
          pending_credits: 0,
          expiring_credits: 0,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      );

    return { user, profile: mapProfileRow(profileRow, user.email) };
  }

  public override async verifyEmailByTokenHash(tokenHash: string): Promise<PortalUserRecord | null> {
    const { data, error } = await this.client
      .from('portal_auth_users')
      .select('*')
      .eq('email_verification_token_hash', tokenHash)
      .maybeSingle();
    this.assertDbOk(error, 'verifyEmailByTokenHash.select');
    if (!data) return null;

    if (
      data.email_verification_expires_at &&
      new Date(data.email_verification_expires_at).getTime() < Date.now()
    ) {
      return null;
    }

    const { data: updated, error: updateErr } = await this.client
      .from('portal_auth_users')
      .update({
        email_verified: true,
        email_verification_token_hash: null,
        email_verification_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .select('*')
      .single();
    this.assertDbOk(updateErr, 'verifyEmailByTokenHash.update');
    return mapAuthUserRow(updated);
  }

  public override async setVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: string
  ): Promise<void> {
    const { error } = await this.client
      .from('portal_auth_users')
      .update({
        email_verification_token_hash: tokenHash,
        email_verification_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    this.assertDbOk(error, 'setVerificationToken');
  }

  public override async setResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: string
  ): Promise<void> {
    const { error } = await this.client
      .from('portal_auth_users')
      .update({
        password_reset_token_hash: tokenHash,
        password_reset_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    this.assertDbOk(error, 'setResetToken');
  }

  public override async resetPasswordByTokenHash(
    tokenHash: string,
    newPasswordHash: string
  ): Promise<PortalUserRecord | null> {
    const { data, error } = await this.client
      .from('portal_auth_users')
      .select('*')
      .eq('password_reset_token_hash', tokenHash)
      .maybeSingle();
    this.assertDbOk(error, 'resetPasswordByTokenHash.select');
    if (!data) return null;

    if (
      data.password_reset_expires_at &&
      new Date(data.password_reset_expires_at).getTime() < Date.now()
    ) {
      return null;
    }

    const { data: updated, error: updateErr } = await this.client
      .from('portal_auth_users')
      .update({
        password_hash: newPasswordHash,
        password_reset_token_hash: null,
        password_reset_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .select('*')
      .single();
    this.assertDbOk(updateErr, 'resetPasswordByTokenHash.update');

    await this.revokeAllUserSessions(String(data.id));
    return mapAuthUserRow(updated);
  }

  public override async updatePassword(userId: string, newPasswordHash: string): Promise<void> {
    const { error } = await this.client
      .from('portal_auth_users')
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    this.assertDbOk(error, 'updatePassword');
  }

  public override async requestEmailChange(
    userId: string,
    newEmail: string,
    tokenHash: string,
    expiresAt: string
  ): Promise<void> {
    const { error } = await this.client
      .from('portal_auth_users')
      .update({
        pending_email: newEmail.trim().toLowerCase(),
        pending_email_token_hash: tokenHash,
        pending_email_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    this.assertDbOk(error, 'requestEmailChange');
  }

  public override async confirmEmailChange(
    userId: string,
    tokenHash: string
  ): Promise<PortalUserRecord | null> {
    const { data, error } = await this.client
      .from('portal_auth_users')
      .select('*')
      .eq('id', userId)
      .eq('pending_email_token_hash', tokenHash)
      .maybeSingle();
    this.assertDbOk(error, 'confirmEmailChange.select');
    if (!data || !data.pending_email) return null;

    if (
      data.pending_email_expires_at &&
      new Date(data.pending_email_expires_at).getTime() < Date.now()
    ) {
      return null;
    }

    const { data: updated, error: updateErr } = await this.client
      .from('portal_auth_users')
      .update({
        email: data.pending_email,
        email_verified: true,
        pending_email: null,
        pending_email_token_hash: null,
        pending_email_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single();
    this.assertDbOk(updateErr, 'confirmEmailChange.update');
    return mapAuthUserRow(updated);
  }

  public override async requestAccountClosure(
    userId: string,
    reason: string
  ): Promise<PortalUserRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('portal_auth_users')
      .update({
        account_status: 'pending_closure',
        closure_requested_at: now,
        closure_reason: reason,
        updated_at: now,
      })
      .eq('id', userId)
      .select('*')
      .single();
    this.assertDbOk(error, 'requestAccountClosure');
    return mapAuthUserRow(data);
  }

  public override async createSession(input: {
    userId: string;
    tokenHash: string;
    userAgent: string;
    ipAddress: string;
    expiresAt: string;
  }): Promise<PortalSessionRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('portal_sessions')
      .insert({
        user_id: input.userId,
        token_hash: input.tokenHash,
        user_agent: input.userAgent,
        ip_address: input.ipAddress,
        created_at: now,
        last_active_at: now,
        expires_at: input.expiresAt,
      })
      .select('*')
      .single();
    this.assertDbOk(error, 'createSession');
    return mapSessionRow(data);
  }

  public override async findActiveSessionByTokenHash(
    tokenHash: string
  ): Promise<PortalSessionRecord | null> {
    const { data, error } = await this.client
      .from('portal_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    this.assertDbOk(error, 'findActiveSessionByTokenHash');
    return data ? mapSessionRow(data) : null;
  }

  public override async listUserSessions(userId: string): Promise<PortalSessionRecord[]> {
    const { data, error } = await this.client
      .from('portal_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    this.assertDbOk(error, 'listUserSessions');
    return (data || []).map(mapSessionRow);
  }

  public override async revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('portal_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select('id');
    this.assertDbOk(error, 'revokeSessionById');
    return Boolean(data && data.length > 0);
  }

  public override async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
    const { error } = await this.client
      .from('portal_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash);
    this.assertDbOk(error, 'revokeSessionByTokenHash');
  }

  public override async revokeOtherUserSessions(
    userId: string,
    keepTokenHash: string
  ): Promise<void> {
    const { error } = await this.client
      .from('portal_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .neq('token_hash', keepTokenHash)
      .is('revoked_at', null);
    this.assertDbOk(error, 'revokeOtherUserSessions');
  }

  public override async revokeAllUserSessions(userId: string): Promise<void> {
    const { error } = await this.client
      .from('portal_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
    this.assertDbOk(error, 'revokeAllUserSessions');
  }

  // -------------------------------------------------------------------------
  // Profile & Billing Addresses (Migration 002)
  // -------------------------------------------------------------------------
  public override async getProfile(userId: string): Promise<PortalProfileRecord | null> {
    const { data, error } = await this.client
      .from('client_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    this.assertDbOk(error, 'getProfile');
    return data ? mapProfileRow(data) : null;
  }

  public override async updateProfile(
    userId: string,
    patch: Partial<PortalProfileRecord>
  ): Promise<PortalProfileRecord> {
    const existing = await this.getProfile(userId);
    const firstName = patch.firstName ?? existing?.firstName ?? '';
    const lastName = patch.lastName ?? existing?.lastName ?? '';
    const fullName = patch.fullName ?? (`${firstName} ${lastName}`.trim() || existing?.fullName || '');

    const { data, error } = await this.client
      .from('client_profiles')
      .upsert(
        {
          user_id: userId,
          email: patch.email ?? existing?.email ?? '',
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          company_name: patch.companyName ?? existing?.companyName ?? '',
          phone: patch.phone ?? existing?.phone ?? '',
          tax_id: patch.taxId ?? existing?.taxId ?? '',
          avatar_url: patch.avatarUrl ?? existing?.avatarUrl ?? '',
          timezone: patch.timezone ?? existing?.timezone ?? 'America/Denver',
          preferred_currency: patch.preferredCurrency ?? existing?.preferredCurrency ?? 'USD',
          notification_preferences:
            patch.notificationPreferences ?? existing?.notificationPreferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();
    this.assertDbOk(error, 'updateProfile');
    return mapProfileRow(data, patch.email ?? existing?.email ?? '');
  }

  public override async listAddresses(userId: string): Promise<ClientAddressRecord[]> {
    const { data, error } = await this.client
      .from('billing_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false });
    this.assertDbOk(error, 'listAddresses');
    return (data || []).map((r: any) => ({
      id: String(r.id),
      userId: String(r.user_id),
      label: String(r.label || 'Primary'),
      line1: String(r.line1 || ''),
      line2: String(r.line2 || ''),
      city: String(r.city || ''),
      stateProvince: String(r.state_province || ''),
      postalCode: String(r.postal_code || ''),
      country: String(r.country || 'United States'),
      isDefault: Boolean(r.is_default),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at || r.created_at),
    }));
  }

  public override async upsertAddress(
    userId: string,
    address: Omit<ClientAddressRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<ClientAddressRecord> {
    if (address.isDefault) {
      await this.client
        .from('billing_addresses')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    const now = new Date().toISOString();
    const payload = {
      ...(address.id ? { id: address.id } : {}),
      user_id: userId,
      label: address.label,
      line1: address.line1,
      line2: address.line2 || '',
      city: address.city,
      state_province: address.stateProvince,
      postal_code: address.postalCode,
      country: address.country,
      is_default: Boolean(address.isDefault),
      updated_at: now,
    };

    const { data, error } = await this.client
      .from('billing_addresses')
      .upsert(payload)
      .select('*')
      .single();
    this.assertDbOk(error, 'upsertAddress');

    return {
      id: String(data.id),
      userId: String(data.user_id),
      label: String(data.label),
      line1: String(data.line1),
      line2: String(data.line2 || ''),
      city: String(data.city),
      stateProvince: String(data.state_province),
      postalCode: String(data.postal_code),
      country: String(data.country),
      isDefault: Boolean(data.is_default),
      createdAt: String(data.created_at || now),
      updatedAt: String(data.updated_at || data.created_at || now),
    };
  }

  public override async deleteAddress(userId: string, addressId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('billing_addresses')
      .delete()
      .eq('id', addressId)
      .eq('user_id', userId)
      .select('id');
    this.assertDbOk(error, 'deleteAddress');
    return Boolean(data && data.length > 0);
  }

  // -------------------------------------------------------------------------
  // Catalog Reads (Supabase with seeded fallback if catalog table unseeded)
  // -------------------------------------------------------------------------
  public override async listCategories(): Promise<ProductCategoryRecord[]> {
    const { data, error } = await this.client
      .from('product_categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error || !data || data.length === 0) {
      return super.listCategories();
    }
    return data.map((row: any) => ({
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      description: String(row.description || ''),
      sortOrder: Number(row.sort_order || 0),
    }));
  }

  public override async listProducts(filters?: {
    categorySlug?: string;
    search?: string;
  }): Promise<ProductRecord[]> {
    const { data: prodRows, error } = await this.client
      .from('products')
      .select('*, product_packages(*)')
      .eq('is_active', true);

    if (error || !prodRows || prodRows.length === 0) {
      return super.listProducts(filters);
    }

    const now = new Date().toISOString();
    let items: ProductRecord[] = prodRows.map((p: any) => ({
      id: String(p.id),
      categoryId: String(p.category_id),
      categorySlug: String(p.category_slug || ''),
      slug: String(p.slug),
      name: String(p.name),
      shortDescription: String(p.short_description || ''),
      fullDescription: String(p.full_description || ''),
      sampleDeliverables: Array.isArray(p.sample_deliverables)
        ? p.sample_deliverables
        : Array.isArray(p.deliverables)
        ? p.deliverables
        : [],
      requiredClientMaterials: Array.isArray(p.required_client_materials)
        ? p.required_client_materials
        : [],
      termsSummary: String(p.terms_summary || 'Subject to Formal DESTRIA TECH INC Commercial Proposal'),
      faqs: Array.isArray(p.faqs) ? p.faqs : Array.isArray(p.faq) ? p.faq : [],
      isFeatured: Boolean(p.is_featured),
      isActive: Boolean(p.is_active),
      createdAt: String(p.created_at || now),
      updatedAt: String(p.updated_at || p.created_at || now),
      packages: (Array.isArray(p.product_packages) ? p.product_packages : []).map((pkg: any) => ({
        id: String(pkg.id),
        productId: String(pkg.product_id),
        name: String(pkg.name),
        tierCode: String(pkg.tier_code || 'standard'),
        priceUsdMinor: Number(pkg.price_usd_minor || 0),
        pricePhpMinor: Number(pkg.price_php_minor || 0),
        isCustomQuote: Boolean(pkg.is_custom_quote),
        billingType: pkg.billing_type || 'one_time',
        creditsIncluded: Number(pkg.credits_included || 0),
        turnaroundLabel: String(pkg.turnaround_label || '5-7 Business Days'),
        validityDays: pkg.validity_days ? Number(pkg.validity_days) : undefined,
        revisionLimit: Number(pkg.revision_limit ?? 2),
        usageLimits: String(pkg.usage_limits || ''),
        deliveryConditions: String(pkg.delivery_conditions || ''),
        supportLevel: String(pkg.support_level || 'Standard'),
        features: Array.isArray(pkg.features) ? pkg.features : [],
        isPopular: Boolean(pkg.is_popular),
        isIllustrativePricing: Boolean(pkg.is_illustrative_pricing ?? true),
      })),
    }));

    if (filters?.categorySlug && filters.categorySlug !== 'all') {
      items = items.filter((p) => p.categorySlug === filters.categorySlug);
    }
    if (filters?.search) {
      const q = filters.search.trim().toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.shortDescription.toLowerCase().includes(q) ||
          p.fullDescription.toLowerCase().includes(q)
      );
    }
    return items;
  }

  public override async getProductBySlug(slug: string): Promise<ProductRecord | null> {
    const products = await this.listProducts();
    return products.find((p) => p.slug === slug) || null;
  }

  // -------------------------------------------------------------------------
  // Custom Inquiries & Approved Proposals (Migration 003)
  // -------------------------------------------------------------------------
  public override async createCustomInquiry(
    input: Omit<CustomPackageInquiryRecord, 'id' | 'referenceNumber' | 'status' | 'createdAt'>
  ): Promise<CustomPackageInquiryRecord> {
    const referenceNumber = `DTI-INQ-${new Date().getFullYear()}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;
    const { data, error } = await this.client
      .from('custom_package_inquiries')
      .insert({
        reference_code: referenceNumber,
        user_id: input.userId,
        company_name: input.companyName || null,
        requested_service: JSON.stringify({
          contactPerson: input.contactPerson,
          email: input.email,
          requiredServices: input.requiredServices,
          estimatedMonthlyVolume: input.estimatedMonthlyVolume,
          supportingFileIds: input.supportingFileIds,
        }),
        project_goals: input.projectDescription,
        budget_range: input.budgetRange || null,
        preferred_timeline: input.expectedSchedule || null,
        status: 'received',
      })
      .select('*')
      .single();
    this.assertDbOk(error, 'createCustomInquiry');
    return {
      id: String(data.id),
      referenceNumber: String(data.reference_code),
      userId: String(data.user_id),
      companyName: String(data.company_name || ''),
      contactPerson: input.contactPerson,
      email: input.email,
      requiredServices: input.requiredServices,
      estimatedMonthlyVolume: input.estimatedMonthlyVolume,
      projectDescription: String(data.project_goals),
      budgetRange: String(data.budget_range || ''),
      expectedSchedule: String(data.preferred_timeline || ''),
      supportingFileIds: input.supportingFileIds,
      status: 'received',
      createdAt: String(data.created_at),
    };
  }

  public override async listCustomInquiries(userId: string): Promise<CustomPackageInquiryRecord[]> {
    const { data, error } = await this.client
      .from('custom_package_inquiries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    this.assertDbOk(error, 'listCustomInquiries');
    return (data || []).map((r: any) => {
      let meta: any = {};
      try {
        meta = JSON.parse(String(r.requested_service || '{}'));
      } catch {
        meta = { requiredServices: r.requested_service ? [String(r.requested_service)] : [] };
      }
      return {
        id: String(r.id),
        referenceNumber: String(r.reference_code),
        userId: String(r.user_id),
        companyName: String(r.company_name || ''),
        contactPerson: String(meta.contactPerson || ''),
        email: String(meta.email || ''),
        requiredServices: Array.isArray(meta.requiredServices) ? meta.requiredServices : [],
        estimatedMonthlyVolume: String(meta.estimatedMonthlyVolume || ''),
        projectDescription: String(r.project_goals || ''),
        budgetRange: String(r.budget_range || ''),
        expectedSchedule: String(r.preferred_timeline || ''),
        supportingFileIds: Array.isArray(meta.supportingFileIds) ? meta.supportingFileIds : [],
        status:
          r.status === 'quoted'
            ? 'quoted'
            : r.status === 'under_review'
            ? 'under_review'
            : 'received',
        createdAt: String(r.created_at),
      };
    });
  }

  public override async createApprovedProposal(input: {
    userId: string;
    inquiryId?: string;
    title: string;
    scopeSummary: string;
    currency: PortalCurrency;
    items: Array<{
      productId: string;
      packageId: string;
      productSlug: string;
      productName: string;
      packageName: string;
      billingType: 'one_time' | 'subscription_monthly' | 'credit_pack';
      quantity: number;
      unitPriceMinor: number;
      creditsAllocated: number;
      revisionLimit: number;
    }>;
    issuedBy?: string;
    expiresInDays?: number;
  }): Promise<ApprovedProposalRecord> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (input.expiresInDays ?? 30) * 24 * 60 * 60 * 1000
    ).toISOString();
    const mappedItems = input.items.map((item) => ({
      id: crypto.randomUUID(),
      ...item,
      lineTotalMinor: item.unitPriceMinor * item.quantity,
    }));
    const subtotalMinor = mappedItems.reduce((sum, item) => sum + item.lineTotalMinor, 0);
    const proposalNumber = `DTI-PROP-${now.getFullYear()}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;

    const { data, error } = await this.client
      .from('approved_proposals')
      .insert({
        proposal_number: proposalNumber,
        user_id: input.userId,
        title: input.title,
        scope_summary: input.scopeSummary,
        currency: input.currency,
        items_json: mappedItems,
        subtotal_minor: subtotalMinor,
        total_minor: subtotalMinor,
        status: 'approved',
        approved_by: input.issuedBy || 'DESTRIA TECH INC Commercial Office',
        approved_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .select('*')
      .single();
    this.assertDbOk(error, 'createApprovedProposal');

    return {
      id: String(data.id),
      proposalNumber: String(data.proposal_number),
      userId: String(data.user_id),
      inquiryId: input.inquiryId,
      title: String(data.title),
      scopeSummary: String(data.scope_summary),
      currency: data.currency === 'PHP' ? 'PHP' : 'USD',
      fxRateSnapshot: USD_TO_PHP_REFERENCE_RATE,
      subtotalMinor: Number(data.subtotal_minor || 0),
      taxMinor: 0,
      totalMinor: Number(data.total_minor || 0),
      status: data.status,
      items: Array.isArray(data.items_json) ? data.items_json : [],
      issuedBy: String(data.approved_by),
      issuedAt: String(data.approved_at),
      expiresAt: String(data.expires_at),
      acceptedOrderId: data.accepted_order_id || undefined,
    };
  }

  public override async listApprovedProposals(userId: string): Promise<ApprovedProposalRecord[]> {
    const { data, error } = await this.client
      .from('approved_proposals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    this.assertDbOk(error, 'listApprovedProposals');
    return (data || []).map((r: any) => ({
      id: String(r.id),
      proposalNumber: String(r.proposal_number),
      userId: String(r.user_id),
      title: String(r.title),
      scopeSummary: String(r.scope_summary),
      currency: r.currency === 'PHP' ? 'PHP' : 'USD',
      fxRateSnapshot: USD_TO_PHP_REFERENCE_RATE,
      subtotalMinor: Number(r.subtotal_minor || 0),
      taxMinor: 0,
      totalMinor: Number(r.total_minor || 0),
      status: r.status,
      items: Array.isArray(r.items_json) ? r.items_json : [],
      issuedBy: String(r.approved_by),
      issuedAt: String(r.approved_at),
      expiresAt: String(r.expires_at),
      acceptedOrderId: r.accepted_order_id || undefined,
    }));
  }

  public override async getApprovedProposalById(
    userId: string,
    proposalId: string
  ): Promise<ApprovedProposalRecord | null> {
    const { data, error } = await this.client
      .from('approved_proposals')
      .select('*')
      .eq('id', proposalId)
      .eq('user_id', userId)
      .maybeSingle();
    this.assertDbOk(error, 'getApprovedProposalById');
    if (!data) return null;
    return {
      id: String(data.id),
      proposalNumber: String(data.proposal_number),
      userId: String(data.user_id),
      title: String(data.title),
      scopeSummary: String(data.scope_summary),
      currency: data.currency === 'PHP' ? 'PHP' : 'USD',
      fxRateSnapshot: USD_TO_PHP_REFERENCE_RATE,
      subtotalMinor: Number(data.subtotal_minor || 0),
      taxMinor: 0,
      totalMinor: Number(data.total_minor || 0),
      status: data.status,
      items: Array.isArray(data.items_json) ? data.items_json : [],
      issuedBy: String(data.approved_by),
      issuedAt: String(data.approved_at),
      expiresAt: String(data.expires_at),
      acceptedOrderId: data.accepted_order_id || undefined,
    };
  }

  public override async markProposalAccepted(
    userId: string,
    proposalId: string,
    orderId: string
  ): Promise<ApprovedProposalRecord | null> {
    const { data, error } = await this.client
      .from('approved_proposals')
      .update({
        status: 'accepted',
        accepted_order_id: orderId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    this.assertDbOk(error, 'markProposalAccepted');
    if (!data) return null;
    return this.getApprovedProposalById(userId, proposalId);
  }

  // -------------------------------------------------------------------------
  // Durable Private File Storage (Supabase Storage + project_attachments)
  // -------------------------------------------------------------------------
  public override async saveAttachment(
    record: Omit<ProjectAttachmentRecord, 'id' | 'uploadedAt'>,
    buffer: Buffer
  ): Promise<ProjectAttachmentRecord> {
    const storagePath = `${record.userId}/${record.storedFileName}`;
    const { error: uploadErr } = await this.client.storage
      .from(this.storageBucket)
      .upload(storagePath, buffer, {
        contentType: record.mimeType,
        upsert: false,
      });
    this.assertDbOk(uploadErr, 'saveAttachment.storageUpload');

    const { data, error } = await this.client
      .from('project_attachments')
      .insert({
        user_id: record.userId,
        project_id: record.projectId || null,
        order_id: record.orderId || null,
        ticket_id: record.ticketId || null,
        file_name: record.fileName,
        stored_file_name: storagePath,
        mime_type: record.mimeType,
        extension: record.extension,
        size_bytes: record.sizeBytes,
        category: record.category,
        version: record.version,
        uploaded_by_role: record.uploadedByRole,
        scan_status: record.scanStatus || 'quarantined_unscanned',
        quarantine_reason: record.quarantineReason || null,
        content_sha256: record.contentSha256 || null,
      })
      .select('*')
      .single();
    this.assertDbOk(error, 'saveAttachment.dbInsert');

    return {
      id: String(data.id),
      userId: String(data.user_id),
      projectId: data.project_id || undefined,
      orderId: data.order_id || undefined,
      ticketId: data.ticket_id || undefined,
      fileName: String(data.file_name),
      storedFileName: String(data.stored_file_name),
      mimeType: String(data.mime_type),
      extension: String(data.extension),
      sizeBytes: Number(data.size_bytes),
      category: data.category,
      version: Number(data.version || 1),
      uploadedByRole: data.uploaded_by_role || 'client',
      scanStatus: data.scan_status || 'quarantined_unscanned',
      quarantineReason: data.quarantine_reason || undefined,
      contentSha256: data.content_sha256 || undefined,
      uploadedAt: String(data.uploaded_at || data.created_at),
    };
  }

  public override async listAttachments(
    userId: string,
    projectId?: string
  ): Promise<ProjectAttachmentRecord[]> {
    let query = this.client
      .from('project_attachments')
      .select('*')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    const { data, error } = await query;
    this.assertDbOk(error, 'listAttachments');
    return (data || []).map((r: any) => ({
      id: String(r.id),
      userId: String(r.user_id),
      projectId: r.project_id || undefined,
      orderId: r.order_id || undefined,
      ticketId: r.ticket_id || undefined,
      fileName: String(r.file_name),
      storedFileName: String(r.stored_file_name),
      mimeType: String(r.mime_type),
      extension: String(r.extension),
      sizeBytes: Number(r.size_bytes),
      category: r.category,
      version: Number(r.version || 1),
      uploadedByRole: r.uploaded_by_role || 'client',
      scanStatus: r.scan_status || 'quarantined_unscanned',
      quarantineReason: r.quarantine_reason || undefined,
      contentSha256: r.content_sha256 || undefined,
      uploadedAt: String(r.uploaded_at || r.created_at),
    }));
  }

  public override async getAttachmentById(
    userId: string,
    fileId: string
  ): Promise<{ record: ProjectAttachmentRecord; buffer: Buffer } | null> {
    const { data, error } = await this.client
      .from('project_attachments')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', userId)
      .maybeSingle();
    this.assertDbOk(error, 'getAttachmentById.select');
    if (!data) return null;

    const { data: blob, error: dlErr } = await this.client.storage
      .from(this.storageBucket)
      .download(String(data.stored_file_name));
    this.assertDbOk(dlErr, 'getAttachmentById.storageDownload');
    if (!blob) return null;

    const buffer = Buffer.from(await blob.arrayBuffer());
    return {
      record: {
        id: String(data.id),
        userId: String(data.user_id),
        projectId: data.project_id || undefined,
        orderId: data.order_id || undefined,
        ticketId: data.ticket_id || undefined,
        fileName: String(data.file_name),
        storedFileName: String(data.stored_file_name),
        mimeType: String(data.mime_type),
        extension: String(data.extension),
        sizeBytes: Number(data.size_bytes),
        category: data.category,
        version: Number(data.version || 1),
        uploadedByRole: data.uploaded_by_role || 'client',
        scanStatus: data.scan_status || 'quarantined_unscanned',
        quarantineReason: data.quarantine_reason || undefined,
        contentSha256: data.content_sha256 || undefined,
        uploadedAt: String(data.uploaded_at || data.created_at),
      },
      buffer,
    };
  }

  // -------------------------------------------------------------------------
  // Durable Notifications & Activity Logs (Migration 002)
  // -------------------------------------------------------------------------
  public override async listNotifications(userId: string): Promise<NotificationRecord[]> {
    const { data, error } = await this.client
      .from('portal_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    this.assertDbOk(error, 'listNotifications');
    return (data || []).map((r: any) => ({
      id: String(r.id),
      userId: String(r.user_id),
      type: r.type,
      title: String(r.title),
      body: String(r.body),
      linkPath: r.link_path || undefined,
      isRead: Boolean(r.is_read),
      createdAt: String(r.created_at),
    }));
  }

  public override async addNotification(
    input: Omit<NotificationRecord, 'id' | 'isRead' | 'createdAt'>
  ): Promise<NotificationRecord> {
    const { data, error } = await this.client
      .from('portal_notifications')
      .insert({
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link_path: input.linkPath || null,
        is_read: false,
      })
      .select('*')
      .single();
    this.assertDbOk(error, 'addNotification');
    return {
      id: String(data.id),
      userId: String(data.user_id),
      type: data.type,
      title: String(data.title),
      body: String(data.body),
      linkPath: data.link_path || undefined,
      isRead: Boolean(data.is_read),
      createdAt: String(data.created_at),
    };
  }

  public override async markNotificationRead(
    userId: string,
    notificationId: string
  ): Promise<boolean> {
    const { data, error } = await this.client
      .from('portal_notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select('id');
    this.assertDbOk(error, 'markNotificationRead');
    return Boolean(data && data.length > 0);
  }

  public override async markAllNotificationsRead(userId: string): Promise<void> {
    const { error } = await this.client
      .from('portal_notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    this.assertDbOk(error, 'markAllNotificationsRead');
  }

  public override async listActivities(
    userId: string,
    limit = 30
  ): Promise<ClientActivityLogRecord[]> {
    const { data, error } = await this.client
      .from('portal_activities')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    this.assertDbOk(error, 'listActivities');
    return (data || []).map((r: any) => ({
      id: String(r.id),
      userId: String(r.user_id),
      eventType: String(r.event_type || r.action || 'activity'),
      title: String(r.title || r.action || 'Portal Activity'),
      detail: String(r.detail || r.summary || ''),
      relatedPath: r.related_path || undefined,
      createdAt: String(r.created_at),
    }));
  }

  public override async addActivity(
    input: Omit<ClientActivityLogRecord, 'id' | 'createdAt'>
  ): Promise<ClientActivityLogRecord> {
    const { data, error } = await this.client
      .from('portal_activities')
      .insert({
        user_id: input.userId,
        event_type: input.eventType,
        title: input.title,
        detail: input.detail,
        related_path: input.relatedPath || null,
      })
      .select('*')
      .single();
    this.assertDbOk(error, 'addActivity');
    return {
      id: String(data.id),
      userId: String(data.user_id),
      eventType: String(data.event_type || input.eventType),
      title: String(data.title || input.title),
      detail: String(data.detail || input.detail),
      relatedPath: data.related_path || undefined,
      createdAt: String(data.created_at),
    };
  }

  // -------------------------------------------------------------------------
  // Enterprise Payment Lifecycle, Refunds & Quarantine Controls (Migration 005)
  // -------------------------------------------------------------------------
  public override async getPaymentByIdInternal(paymentId: string): Promise<PaymentRecord | null> {
    const { data, error } = await this.client
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    this.assertDbOk(error, 'getPaymentByIdInternal');
    if (!data) return null;
    return {
      id: String(data.id),
      orderId: String(data.order_id),
      orderNumber: String(data.order_number || ''),
      userId: String(data.user_id),
      provider: data.provider as PaymentProviderId,
      environment: (data.environment || 'sandbox') as 'disabled' | 'sandbox' | 'live',
      amountMinor: Number(data.amount_minor),
      currency: data.currency as PortalCurrency,
      status: data.status as PaymentStatus,
      providerTransactionId: data.provider_transaction_id || undefined,
      checkoutUrl: data.checkout_url || undefined,
      idempotencyKey: String(data.idempotency_key || ''),
      failureReason: data.failure_reason || undefined,
      refundedMinor: Number(data.refunded_minor || 0),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at || data.created_at),
    };
  }

  public override async updatePaymentInitiation(
    paymentId: string,
    patch: {
      providerTransactionId?: string;
      checkoutUrl?: string;
      environment: 'disabled' | 'sandbox' | 'live';
      status?: PaymentStatus;
      failureReason?: string;
    }
  ): Promise<PaymentRecord | null> {
    const updatePayload: Record<string, unknown> = {
      environment: patch.environment,
      updated_at: new Date().toISOString(),
    };
    if (patch.providerTransactionId) updatePayload.provider_transaction_id = patch.providerTransactionId;
    if (patch.checkoutUrl !== undefined) updatePayload.checkout_url = patch.checkoutUrl;
    if (patch.status) updatePayload.status = patch.status;
    if (patch.failureReason !== undefined) updatePayload.failure_reason = patch.failureReason;

    const { data, error } = await this.client
      .from('payments')
      .update(updatePayload)
      .eq('id', paymentId)
      .select('*')
      .maybeSingle();
    this.assertDbOk(error, 'updatePaymentInitiation');
    if (!data) return null;
    return this.getPaymentByIdInternal(paymentId);
  }

  public override async recordAuthorizedRefund(input: {
    paymentId: string;
    orderId: string;
    provider: PaymentProviderId;
    providerTransactionId?: string;
    providerRefundId?: string;
    amountMinor: number;
    currency: PortalCurrency;
    reason: string;
    status: 'pending' | 'succeeded' | 'failed';
    idempotencyKey: string;
    requestedBy: string;
    approvedBy?: string;
  }): Promise<{
    refund: PaymentRefundRecord;
    payment?: PaymentRecord;
    order?: OrderRecord;
    deduplicated: boolean;
  }> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('Refund amountMinor must be a positive integer in minor currency units.');
    }

    const mapRefund = (row: any): PaymentRefundRecord => ({
      id: String(row.id),
      paymentId: String(row.payment_id),
      orderId: String(row.order_id),
      provider: row.provider as PaymentProviderId,
      providerTransactionId: row.provider_transaction_id || undefined,
      providerRefundId: row.provider_refund_id || undefined,
      amountMinor: Number(row.amount_minor),
      currency: row.currency as PortalCurrency,
      reason: String(row.reason),
      status: row.status as 'pending' | 'succeeded' | 'failed',
      idempotencyKey: String(row.idempotency_key),
      requestedBy: String(row.requested_by),
      approvedBy: row.approved_by || undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at || row.created_at),
    });

    const payment = await this.getPaymentByIdInternal(input.paymentId);
    if (!payment) {
      throw new Error('Payment record not found.');
    }

    const remaining = payment.amountMinor - (payment.refundedMinor || 0);
    if (input.status !== 'failed' && input.amountMinor > remaining) {
      throw new Error(
        `Requested refund (${input.amountMinor}) exceeds remaining refundable minor units (${remaining}).`
      );
    }

    const { data, error } = await this.client
      .from('portal_payment_refunds')
      .insert({
        payment_id: input.paymentId,
        order_id: input.orderId,
        provider: input.provider,
        provider_transaction_id: input.providerTransactionId || null,
        provider_refund_id: input.providerRefundId || null,
        amount_minor: input.amountMinor,
        currency: input.currency,
        reason: input.reason.trim(),
        status: input.status,
        idempotency_key: input.idempotencyKey,
        requested_by: input.requestedBy,
        approved_by: input.approvedBy || null,
      })
      .select('*')
      .single();

    if (error && (error as any).code === '23505') {
      const { data: existing, error: fetchErr } = await this.client
        .from('portal_payment_refunds')
        .select('*')
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle();
      this.assertDbOk(fetchErr, 'recordAuthorizedRefund.dedupeFetch');
      if (existing) {
        return {
          refund: mapRefund(existing),
          payment,
          order: (await this.getOrderByIdInternal(input.orderId)) || undefined,
          deduplicated: true,
        };
      }
    }
    this.assertDbOk(error, 'recordAuthorizedRefund.insert');

    let updatedPayment = payment;
    if (input.status === 'succeeded') {
      const nextRefundedMinor = Math.min(
        payment.amountMinor,
        (payment.refundedMinor || 0) + input.amountMinor
      );
      const nextStatus: PaymentStatus =
        nextRefundedMinor >= payment.amountMinor ? 'refunded' : 'partially_refunded';
      const nowIso = new Date().toISOString();
      const { error: payErr } = await this.client
        .from('payments')
        .update({
          refunded_minor: nextRefundedMinor,
          status: nextStatus,
          updated_at: nowIso,
        })
        .eq('id', input.paymentId);
      this.assertDbOk(payErr, 'recordAuthorizedRefund.updatePayment');

      const orderPatch: Record<string, unknown> = {
        payment_status: nextStatus,
        updated_at: nowIso,
      };
      if (nextStatus === 'refunded') {
        orderPatch.fulfillment_status = 'cancelled';
      }
      const { error: ordErr } = await this.client
        .from('orders')
        .update(orderPatch)
        .eq('id', input.orderId);
      this.assertDbOk(ordErr, 'recordAuthorizedRefund.updateOrder');

      const refreshed = await this.getPaymentByIdInternal(input.paymentId);
      if (refreshed) updatedPayment = refreshed;
    }

    return {
      refund: mapRefund(data),
      payment: updatedPayment,
      order: (await this.getOrderByIdInternal(input.orderId)) || undefined,
      deduplicated: false,
    };
  }

  public override async listRefundsByPaymentId(paymentId: string): Promise<PaymentRefundRecord[]> {
    const { data, error } = await this.client
      .from('portal_payment_refunds')
      .select('*')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: false });
    this.assertDbOk(error, 'listRefundsByPaymentId');
    return (data || []).map((row: any) => ({
      id: String(row.id),
      paymentId: String(row.payment_id),
      orderId: String(row.order_id),
      provider: row.provider as PaymentProviderId,
      providerTransactionId: row.provider_transaction_id || undefined,
      providerRefundId: row.provider_refund_id || undefined,
      amountMinor: Number(row.amount_minor),
      currency: row.currency as PortalCurrency,
      reason: String(row.reason),
      status: row.status as 'pending' | 'succeeded' | 'failed',
      idempotencyKey: String(row.idempotency_key),
      requestedBy: String(row.requested_by),
      approvedBy: row.approved_by || undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at || row.created_at),
    }));
  }

  public override async updateAttachmentScanStatus(
    fileId: string,
    scanStatus: FileScanStatus,
    quarantineReason?: string
  ): Promise<ProjectAttachmentRecord | null> {
    const { data, error } = await this.client
      .from('project_attachments')
      .update({
        scan_status: scanStatus,
        quarantine_reason:
          scanStatus === 'clean'
            ? null
            : quarantineReason ||
              (scanStatus === 'flagged'
                ? 'Flagged by security screening.'
                : 'Pending security screening.'),
      })
      .eq('id', fileId)
      .select('*')
      .maybeSingle();
    this.assertDbOk(error, 'updateAttachmentScanStatus');
    if (!data) return null;
    return {
      id: String(data.id),
      userId: String(data.user_id),
      projectId: data.project_id || undefined,
      orderId: data.order_id || undefined,
      ticketId: data.ticket_id || undefined,
      fileName: String(data.file_name),
      storedFileName: String(data.stored_file_name),
      mimeType: String(data.mime_type),
      extension: String(data.extension),
      sizeBytes: Number(data.size_bytes),
      category: data.category,
      version: Number(data.version || 1),
      uploadedByRole: data.uploaded_by_role || 'client',
      scanStatus: (data.scan_status || 'quarantined_unscanned') as FileScanStatus,
      quarantineReason: data.quarantine_reason || undefined,
      contentSha256: data.content_sha256 || undefined,
      uploadedAt: String(data.uploaded_at || data.created_at),
    };
  }
}
