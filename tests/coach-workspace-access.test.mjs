import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brandIdFromOrganizationSlug,
  isKnownOrganizationSlug,
} from '../src/coach/workspace/org-brand.mjs';
import { buildWorkspaceStubProfile } from '../src/coach/workspace/workspace-client-stub.mjs';
import {
  assertWorkspaceClientAccess,
  NUTRITION_ENTITLEMENT_DENIED_CODE,
  NUTRITION_ENTITLEMENT_DENIED_MESSAGE,
  parseClientIdParam,
  workspaceOpenPath,
} from '../src/coach/workspace/workspace-access.mjs';

const KR_MEM = {
  role: 'platform_owner',
  organizationId: '11111111-1111-4111-8111-111111111111',
  organization: { id: '11111111-1111-4111-8111-111111111111', slug: 'kr-kinetics', name: 'KR Kinetics' },
};

const ELEVATE_MEM = {
  role: 'coach',
  organizationId: '22222222-2222-4222-8222-222222222222',
  organization: { id: '22222222-2222-4222-8222-222222222222', slug: 'elevate-fitness', name: 'Elevate Fitness' },
};

test('org slug maps to exclusive PDF brand ids', () => {
  assert.equal(brandIdFromOrganizationSlug('kr-kinetics'), 'kr');
  assert.equal(brandIdFromOrganizationSlug('elevate-fitness'), 'elevate');
  assert.equal(brandIdFromOrganizationSlug('unknown'), null);
  assert.equal(isKnownOrganizationSlug('kr-kinetics'), true);
});

test('workspace open path encodes real client id', () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  assert.equal(workspaceOpenPath(id), `/workspace/?client_id=${id}`);
  assert.equal(parseClientIdParam(id), id);
  assert.equal(parseClientIdParam('not-a-uuid'), null);
});

test('KR membership cannot open Elevate client (access guard)', () => {
  const elevateClient = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Client Elevate',
    notes: 'demo',
    organization_id: ELEVATE_MEM.organizationId,
    service_type: 'nutrition',
  };
  assert.throws(
    () => assertWorkspaceClientAccess({ client: elevateClient, membership: KR_MEM }),
    /autre organisation|hors de votre organisation/i,
  );
});

test('Elevate membership cannot open KR client (access guard)', () => {
  const krClient = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Client KR',
    notes: 'demo',
    organization_id: KR_MEM.organizationId,
    service_type: 'nutrition',
  };
  assert.throws(
    () => assertWorkspaceClientAccess({ client: krClient, membership: ELEVATE_MEM }),
    /autre organisation|hors de votre organisation/i,
  );
});

test('same-org client opens with matching brand workspace profile', () => {
  const client = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Client KR',
    notes: 'dossier',
    organization_id: KR_MEM.organizationId,
    service_type: 'nutrition',
  };
  const ctx = assertWorkspaceClientAccess({ client, membership: KR_MEM });
  assert.equal(ctx.brandId, 'kr');
  assert.equal(ctx.organizationSlug, 'kr-kinetics');
  assert.equal(ctx.fullName, 'Client KR');
  assert.equal(ctx.stub.nom, 'Client KR');
  assert.equal(ctx.stub.workspaceMeta.organizationSlug, 'kr-kinetics');
  assert.equal(ctx.stub.workspaceMeta.fictional, false);
});

test('legacy fictional marker does not drive authorization; tenant and entitlement do', () => {
  const client = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Legacy marker',
    organization_id: KR_MEM.organizationId,
    is_fictional: true,
    service_type: 'nutrition',
  };
  const ctx = assertWorkspaceClientAccess({ client, membership: KR_MEM });
  assert.equal(ctx.clientId, client.id);
});

test('programming-only clients are denied nutrition workspace with a specific message', () => {
  const client = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Client Programmation',
    organization_id: KR_MEM.organizationId,
    service_type: 'programming',
  };
  try {
    assertWorkspaceClientAccess({ client, membership: KR_MEM });
    assert.fail('expected nutrition entitlement denial');
  } catch (err) {
    assert.equal(err.code, NUTRITION_ENTITLEMENT_DENIED_CODE);
    assert.equal(err.message, NUTRITION_ENTITLEMENT_DENIED_MESSAGE);
  }
});

test('complete clients may open the nutrition workspace', () => {
  const client = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Client Complet',
    notes: 'dossier',
    organization_id: KR_MEM.organizationId,
    service_type: 'complete',
  };
  const ctx = assertWorkspaceClientAccess({ client, membership: KR_MEM });
  assert.equal(ctx.fullName, 'Client Complet');
  assert.equal(ctx.serviceType, 'complete');
});

test('missing service_type fails closed for nutrition workspace', () => {
  const client = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Sans service',
    organization_id: KR_MEM.organizationId,
  };
  assert.throws(
    () => assertWorkspaceClientAccess({ client, membership: KR_MEM }),
    (err) => err.code === NUTRITION_ENTITLEMENT_DENIED_CODE,
  );
});

test('workspace profile stays a blank dossier (no invented meal plan)', () => {
  const stub = buildWorkspaceStubProfile({ fullName: 'X', clientId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
  assert.equal(stub.jours.entrainement.banque.pro, '0');
  assert.equal(stub.jours.entrainement.repartition, undefined);
  assert.equal(stub.workspaceMeta.fictional, false);
  assert.equal(stub.workspaceMeta.template, true);
});
