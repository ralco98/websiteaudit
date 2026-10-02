import { Role } from '@convertaudit/contracts';

export type Action =
  | 'audit:create'
  | 'audit:view'
  | 'audit:delete'
  | 'export:pdf'
  | 'export:json'
  | 'share:create'
  | 'brand:manage'
  | 'monitor:manage'
  | 'apiKey:manage'
  | 'member:manage'
  | 'billing:view'
  | 'billing:manage'
  | 'tenant:delete';

export interface Actor {
  tenantId: string;
  userId?: string;
  role: Role;
  scopes?: number; // bitmask for API keys
  isGuest?: boolean;
}

export interface Resource {
  tenantId: string;
  ownerId?: string;
  type: string;
}

export class AuthorizationError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'FORBIDDEN', message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Permission Matrix per rules.md §3.2
 */
const ROLE_PERMISSIONS: Record<Role, Set<Action>> = {
  [Role.OWNER]: new Set<Action>([
    'audit:create', 'audit:view', 'audit:delete', 'export:pdf', 'export:json',
    'share:create', 'brand:manage', 'monitor:manage', 'apiKey:manage',
    'member:manage', 'billing:view', 'billing:manage', 'tenant:delete'
  ]),
  [Role.ADMIN]: new Set<Action>([
    'audit:create', 'audit:view', 'audit:delete', 'export:pdf', 'export:json',
    'share:create', 'brand:manage', 'monitor:manage', 'apiKey:manage',
    'member:manage'
  ]),
  [Role.MEMBER]: new Set<Action>([
    'audit:create', 'audit:view', 'audit:delete', 'export:pdf', 'export:json',
    'share:create', 'monitor:manage'
  ]),
  [Role.VIEWER]: new Set<Action>([
    'audit:view', 'export:json'
  ]),
};

export const policy = {
  can(actor: Actor, action: Action, resource?: Resource): boolean {
    if (!actor) return false;

    // Cross-tenant check: Rule P-02 enforces 404 (handled by caller or assert)
    if (resource && resource.tenantId !== actor.tenantId) {
      return false;
    }

    // Role-based permission check
    const allowedActions = ROLE_PERMISSIONS[actor.role];
    if (!allowedActions || !allowedActions.has(action)) {
      return false;
    }

    // Ownership check for Member deletions (members can only delete their own audits)
    if (action === 'audit:delete' && actor.role === Role.MEMBER) {
      if (resource && resource.ownerId && resource.ownerId !== actor.userId) {
        return false;
      }
    }

    return true;
  },

  assert(actor: Actor, action: Action, resource?: Resource): void {
    if (resource && resource.tenantId !== actor.tenantId) {
      // P-02: Cross-tenant IDs MUST return 404, never 403, to avoid resource enumeration
      throw new AuthorizationError('NOT_FOUND', 'Resource not found');
    }

    if (!this.can(actor, action, resource)) {
      throw new AuthorizationError('FORBIDDEN', `Action '${action}' is not permitted for your role`);
    }
  }
};
