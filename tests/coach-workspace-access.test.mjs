import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brandIdFromOrganizationSlug,
  isKnownOrganizationSlug,
} from '../src/coach/workspace/org-brand.mjs';
import { buildWorkspaceStubProfile } from '../src/coach/workspace/workspace-client-stub.mjs';
import {
  assertWorkspaceClientAccess,
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

test('workspace open path encodes fictional client id', () => {
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
    is_fictional: true,
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
    is_fictional: true,
  };
  assert.throws(
    () => assertWorkspaceClientAccess({ client: krClient, membership: ELEVATE_MEM }),
    /autre organisation|hors de votre organisation/i,
  );
});

test('same-org fictional client opens with matching brand stub', () => {
  const client = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Client Démo KR',
    notes: 'fictif',
    organization_id: KR_MEM.organizationId,
    is_fictional: true,
  };
  const ctx = assertWorkspaceClientAccess({ client, membership: KR_MEM });
  assert.equal(ctx.brandId, 'kr');
  assert.equal(ctx.organizationSlug, 'kr-kinetics');
  assert.equal(ctx.fullName, 'Client Démo KR');
  assert.equal(ctx.stub.nom, 'Client Démo KR');
  assert.equal(ctx.stub.workspaceMeta.fictional, true);
  assert.equal(ctx.stub.workspaceMeta.organizationSlug, 'kr-kinetics');
});

test('non-fictional clients are refused', () => {
  const client = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    full_name: 'Vrai client',
    organization_id: KR_MEM.organizationId,
    is_fictional: false,
  };
  assert.throws(
    () => assertWorkspaceClientAccess({ client, membership: KR_MEM }),
    /clients fictifs/i,
  );
});

test('workspace stub stays a blank dossier (no invented meal plan)', () => {
  const stub = buildWorkspaceStubProfile({ fullName: 'X', clientId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
  assert.equal(stub.jours.entrainement.banque.pro, '0');
  assert.equal(stub.jours.entrainement.repartition, undefined);
});
