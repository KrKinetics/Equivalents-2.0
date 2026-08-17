import { OFFICIAL_BASE_COUNT } from '/src/coach/motivation/client/official-bundle.mjs';

const stepLabel = document.getElementById('step-label');
const progressBar = document.getElementById('progress-bar');

function presentStableProgress() {
  if (!stepLabel || !progressBar) return;
  const text = String(stepLabel.textContent || '').trim();
  if (text === 'Consentement') {
    progressBar.style.width = '100%';
    return;
  }

  const match = text.match(/^Question\s+(\d+)(?:\s+sur\s+\d+)?$/i);
  if (!match) return;

  const position = Number(match[1]);
  if (!Number.isFinite(position) || position < 1) return;

  if (position <= OFFICIAL_BASE_COUNT) {
    stepLabel.textContent = `Question principale ${position} sur ${OFFICIAL_BASE_COUNT}`;
    progressBar.style.width = `${Math.min(88, Math.max(2, (position / OFFICIAL_BASE_COUNT) * 88))}%`;
    return;
  }

  const precisionIndex = position - OFFICIAL_BASE_COUNT;
  stepLabel.textContent = `Question de précision ${precisionIndex}`;
  progressBar.style.width = `${Math.min(98, 88 + precisionIndex * 2)}%`;
}

if (stepLabel && progressBar) {
  const observer = new MutationObserver(() => presentStableProgress());
  observer.observe(stepLabel, { childList: true, characterData: true, subtree: true });
  presentStableProgress();
}
