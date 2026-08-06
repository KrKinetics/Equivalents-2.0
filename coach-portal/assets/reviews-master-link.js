import { getPortalSupabase, recoverSession } from './auth-session.js';

const MASTER_USER_ID = '143f2b15-5d24-4992-b648-42c43bd1e802';
const link = document.getElementById('reviews-master-link');

async function revealForMaster() {
  if (!link) return;
  const supabase = getPortalSupabase();
  const session = await recoverSession(supabase);
  if (!session || session.user.id !== MASTER_USER_ID) return;
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organizations(slug)')
    .eq('user_id', session.user.id);
  if (error) return;
  const allowed = Array.isArray(data) && data.some((membership) =>
    membership.role === 'platform_owner'
    && membership.organizations?.slug === 'kr-kinetics'
  );
  link.classList.toggle('hidden', !allowed);
}

revealForMaster().catch(() => {});
