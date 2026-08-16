/**
 * Current KR Kinetics visual tokens for motivation PDF v4.2.
 * Do not reuse historical PDF identity colors here.
 */

import { KR_V42_LOGO_PATHS } from './kr-v42-logo.mjs';

export const KR_V42_COLORS = {
  bg: '#f4f7fb',
  card: '#ffffff',
  text: '#111b33',
  muted: '#64748b',
  primary: '#071b41',
  accent: '#ed1136',
  border: '#d7e0ec',
  white: '#ffffff',
};

export const KR_V42_PAGE = {
  size: 'LETTER',
  width: 612,
  height: 792,
  marginX: 44,
  headerHeight: 42,
  footerHeight: 30,
};

export const KR_V42_TYPE = {
  kicker: 8,
  title: 20,
  subtitle: 11,
  section: 12,
  subsection: 9,
  body: 9.5,
  small: 8,
  meta: 8,
  footer: 7,
};

export const KR_V42_BRAND = {
  name: 'KR Kinetics',
  reportTitle: 'Profil motivationnel',
  reportSubtitle: 'Rapport Coach',
  confidential: 'Confidentiel — usage Coach KR Kinetics',
  logoRelativePaths: KR_V42_LOGO_PATHS,
};
