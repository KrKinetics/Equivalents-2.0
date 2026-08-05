const BRAND_FILENAMES = Object.freeze({
  kr: 'KR_Kinetics',
  elevate: 'Elevate_Fitness',
});

export function buildPdfFilename({ locale = 'fr', brandSlug, athleteName, dateIso } = {}) {
  const brand = BRAND_FILENAMES[brandSlug] || BRAND_FILENAMES.kr;
  const safe = String(athleteName || 'Athlete').replace(/[^a-zA-Z0-9À-ſ_-]/g, '_') || 'Athlete';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateIso)) ? dateIso : new Date().toISOString().slice(0, 10);
  return `Plan_${brand}_${safe}_${date}${locale === 'en' ? '_EN' : ''}.pdf`;
}
