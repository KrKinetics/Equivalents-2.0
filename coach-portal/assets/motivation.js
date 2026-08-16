import { getPortalSupabase } from './auth-session.js';
import {
  LIKERT_LABELS,
} from '/src/coach/motivation/client/official-bundle.mjs';
import {
  assertOfficialMotivationBundle,
  answerFromControl,
  controlValueFromAnswer,
  getMotivationQuestion,
  isQuestionAnswered,
  presentedCodesFromAnswers,
  V41_BASE_CODES,
} from '/src/coach/motivation/client/public-questionnaire.mjs';

const token = new URLSearchParams(window.location.search).get('token') || '';
const loadingCard = document.getElementById('loading-card');
const errorCard = document.getElementById('error-card');
const errorMessage = document.getElementById('error-message');
const doneCard = document.getElementById('done-card');
const form = document.getElementById('motivation-form');
const clientName = document.getElementById('client-name');
const brandLogo = document.getElementById('brand-logo');
const progressBar = document.getElementById('progress-bar');
const stepLabel = document.getElementById('step-label');
const sectionLabel = document.getElementById('section-label');
const saveStatus = document.getElementById('save-status');
const formError = document.getElementById('form-error');
const questionHost = document.getElementById('question-host');
const consentStep = document.getElementById('consent-step');
const consentInput = document.getElementById('consent');
const backButton = document.getElementById('back-button');
const nextButton = document.getElementById('next-button');
const submitButton = document.getElementById('submit-button');

const LIKERT_SCALE = [1, 2, 3, 4, 5];
const SAVE_DEBOUNCE_MS = 700;

let supabase;
let presentedCodes = [...V41_BASE_CODES];
let answersByCode = new Map();
let currentIndex = 0;
let consentGiven = false;
let locked = false;
let saving = false;
let saveTimer = 0;
let lastSavedSnapshot = '';

function showOnly(target) {
  for (const el of [loadingCard, errorCard, doneCard, form]) {
    el.classList.toggle('hidden', el !== target);
  }
}

function showError(message) {
  errorMessage.textContent = message || 'Le lien est invalide, expiré ou a été remplacé.';
  showOnly(errorCard);
}

function setFormError(message = '') {
  formError.textContent = message;
  formError.classList.toggle('hidden', !message);
}

function setSaveStatus(message, state = '') {
  saveStatus.textContent = message;
  saveStatus.dataset.state = state;
}

function persistedAnswers() {
  return presentedCodes
    .map((code) => answersByCode.get(code))
    .filter(Boolean);
}

function snapshot() {
  return JSON.stringify({
    answers: persistedAnswers(),
    presented: presentedCodes,
    consent: consentGiven,
  });
}

function currentQuestion() {
  if (currentIndex >= presentedCodes.length) return null;
  return getMotivationQuestion(presentedCodes[currentIndex]);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderQuestion(question) {
  const stored = answersByCode.get(question.code);
  const value = controlValueFromAnswer(question, stored);
  const type = question.type ?? 'likert';
  const requiredMark = question.required === false ? '' : ' <span aria-hidden="true">*</span>';
  let field = '';

  if (type === 'likert') {
    field = `<fieldset class="motivation-likert" data-required="${escapeHtml(question.code)}">
      <legend class="visually-hidden">${escapeHtml(question.text)}</legend>
      ${LIKERT_SCALE.map((n, i) => `
        <label>
          <input type="radio" name="${escapeHtml(question.code)}" value="${n}" ${String(value) === String(n) ? 'checked' : ''}>
          <span class="motivation-likert-n">${n}</span>
          <span class="motivation-likert-l">${escapeHtml(LIKERT_LABELS[i])}</span>
        </label>
      `).join('')}
    </fieldset>`;
  } else if (type === 'single_choice') {
    field = `<fieldset class="motivation-choices" data-required="${escapeHtml(question.code)}">
      ${(question.options || []).map((option) => `
        <label>
          <input type="radio" name="${escapeHtml(question.code)}" value="${escapeHtml(option)}" ${value === option ? 'checked' : ''}>
          <span>${escapeHtml(option)}</span>
        </label>
      `).join('')}
    </fieldset>`;
  } else if (type === 'multiple_choice') {
    const selected = Array.isArray(value) ? value : [];
    field = `<fieldset class="motivation-choices" data-max="${question.maxSelections || 3}">
      ${(question.options || []).map((option) => `
        <label>
          <input type="checkbox" name="${escapeHtml(question.code)}" value="${escapeHtml(option)}" ${selected.includes(option) ? 'checked' : ''}>
          <span>${escapeHtml(option)}</span>
        </label>
      `).join('')}
    </fieldset>`;
  } else {
    const tag = type === 'short_text' ? 'input' : 'textarea';
    const required = question.required === false ? '' : 'required';
    field = tag === 'input'
      ? `<input name="${escapeHtml(question.code)}" type="text" maxlength="240" ${required} value="${escapeHtml(value)}">`
      : `<textarea name="${escapeHtml(question.code)}" rows="4" maxlength="2000" ${required}>${escapeHtml(value)}</textarea>`;
  }

  questionHost.innerHTML = `
    <div class="field-group">
      <label>${escapeHtml(question.text)}${requiredMark}</label>
      ${question.description ? `<p class="motivation-help">${escapeHtml(question.description)}</p>` : ''}
      ${field}
    </div>
  `;
}

function collectCurrentAnswer() {
  const question = currentQuestion();
  if (!question) return;
  const type = question.type ?? 'likert';
  let value;
  if (type === 'multiple_choice') {
    value = [...questionHost.querySelectorAll(`input[name="${CSS.escape(question.code)}"]:checked`)].map((el) => el.value);
  } else {
    const field = questionHost.querySelector(`[name="${CSS.escape(question.code)}"]:checked`)
      || questionHost.querySelector(`[name="${CSS.escape(question.code)}"]`);
    value = field ? field.value : '';
  }
  const answer = answerFromControl(question, value);
  if (isQuestionAnswered(question, answer) || type === 'multiple_choice' || type === 'short_text' || type === 'long_text') {
    answersByCode.set(question.code, answer);
  }
}

function maybeUnlockAdaptive() {
  const baseAnswers = V41_BASE_CODES
    .map((code) => answersByCode.get(code))
    .filter(Boolean);
  if (baseAnswers.length < V41_BASE_CODES.length) return;
  presentedCodes = presentedCodesFromAnswers(persistedAnswers(), presentedCodes);
}

function updateUi() {
  const onConsent = currentIndex >= presentedCodes.length;
  const question = currentQuestion();
  consentStep.classList.toggle('hidden', !onConsent);
  questionHost.classList.toggle('hidden', onConsent);
  if (question) {
    sectionLabel.textContent = question.section || 'Profil motivationnel';
    renderQuestion(question);
  } else {
    sectionLabel.textContent = 'Consentement';
    questionHost.innerHTML = '';
  }
  const total = presentedCodes.length + 1;
  const position = Math.min(currentIndex + 1, total);
  stepLabel.textContent = onConsent
    ? 'Consentement'
    : `Question ${position} sur ${presentedCodes.length}`;
  progressBar.style.width = `${(position / total) * 100}%`;
  backButton.classList.toggle('hidden', currentIndex === 0);
  nextButton.classList.toggle('hidden', onConsent);
  submitButton.classList.toggle('hidden', !onConsent);
  consentInput.checked = consentGiven;
  setFormError('');
}

function validateCurrent() {
  if (currentIndex >= presentedCodes.length) {
    if (!consentInput.checked) {
      setFormError('Le consentement est requis avant l’envoi.');
      return false;
    }
    return true;
  }
  collectCurrentAnswer();
  const question = currentQuestion();
  const answer = answersByCode.get(question.code);
  if (!isQuestionAnswered(question, answer)) {
    setFormError('Veuillez répondre avant de continuer.');
    return false;
  }
  if (question.type === 'multiple_choice') {
    const max = question.maxSelections || 3;
    const count = answer.selectedOptions?.length || 0;
    if (count > max) {
      setFormError(`Choisissez au plus ${max} éléments.`);
      return false;
    }
  }
  return true;
}

async function saveDraft({ quiet = false } = {}) {
  if (locked || saving || !supabase) return true;
  collectCurrentAnswer();
  consentGiven = consentInput.checked === true;
  maybeUnlockAdaptive();
  const nextSnapshot = snapshot();
  if (nextSnapshot === lastSavedSnapshot) return true;
  saving = true;
  if (!quiet) setSaveStatus('Sauvegarde…', 'saving');
  try {
    const { error } = await supabase.rpc('save_client_motivation', {
      p_token: token,
      p_answers: persistedAnswers(),
      p_presented_question_codes: presentedCodes,
      p_consent_given: consentGiven,
    });
    if (error) throw error;
    lastSavedSnapshot = nextSnapshot;
    setSaveStatus('Sauvegardé', 'saved');
    return true;
  } catch (error) {
    setSaveStatus('Erreur de sauvegarde', 'error');
    if (!quiet) setFormError(error.message || 'Impossible de sauvegarder vos réponses.');
    return false;
  } finally {
    saving = false;
  }
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveDraft({ quiet: true });
  }, SAVE_DEBOUNCE_MS);
}

function restoreFromPayload(data) {
  const savedAnswers = Array.isArray(data.answers) ? data.answers : [];
  answersByCode = new Map(
    savedAnswers
      .filter((answer) => answer && answer.questionCode)
      .map((answer) => [answer.questionCode, answer]),
  );
  const savedCodes = Array.isArray(data.presented_question_codes)
    ? data.presented_question_codes.filter((code) => getMotivationQuestion(code))
    : [];
  presentedCodes = savedCodes.length ? savedCodes : [...V41_BASE_CODES];
  maybeUnlockAdaptive();
  consentGiven = data.consent_given === true;
  const firstUnanswered = presentedCodes.findIndex((code) => {
    const question = getMotivationQuestion(code);
    return question && !isQuestionAnswered(question, answersByCode.get(code));
  });
  currentIndex = firstUnanswered === -1 ? presentedCodes.length : firstUnanswered;
}

async function boot() {
  if (!token) {
    showError('Le lien ne contient pas de jeton valide.');
    return;
  }
  try {
    supabase = getPortalSupabase();
    const { data, error } = await supabase.rpc('get_client_motivation', { p_token: token });
    if (error) throw error;
    const compatible = assertOfficialMotivationBundle(data);
    if (!compatible.ok) {
      showError('Cette version du questionnaire n’est plus compatible. Demandez un nouveau lien à votre coach.');
      return;
    }
    clientName.textContent = data.client_name ? `${data.client_name}` : '';
    if (brandLogo) {
      brandLogo.src = './assets/logo-kr-kinetics-horizontal.png';
      brandLogo.alt = 'KR Kinetics';
    }
    if (data.invite_status === 'submitted' || data.response_status === 'submitted') {
      locked = true;
      showOnly(doneCard);
      return;
    }
    restoreFromPayload(data);
    lastSavedSnapshot = snapshot();
    updateUi();
    showOnly(form);
  } catch (error) {
    showError(error.message || 'Le lien est invalide, expiré ou a été remplacé.');
  }
}

questionHost.addEventListener('change', () => {
  collectCurrentAnswer();
  maybeUnlockAdaptive();
  scheduleSave();
});
questionHost.addEventListener('input', () => {
  collectCurrentAnswer();
  scheduleSave();
});
consentInput.addEventListener('change', () => {
  consentGiven = consentInput.checked === true;
  scheduleSave();
});

nextButton.addEventListener('click', async () => {
  if (!validateCurrent()) return;
  const saved = await saveDraft();
  if (!saved) return;
  currentIndex += 1;
  updateUi();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

backButton.addEventListener('click', async () => {
  collectCurrentAnswer();
  await saveDraft({ quiet: true });
  currentIndex = Math.max(0, currentIndex - 1);
  updateUi();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateCurrent()) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Envoi en cours…';
  setFormError('');
  collectCurrentAnswer();
  maybeUnlockAdaptive();
  consentGiven = true;
  try {
    const { error } = await supabase.rpc('submit_client_motivation', {
      p_token: token,
      p_answers: persistedAnswers(),
      p_presented_question_codes: presentedCodes,
      p_consent_given: true,
    });
    if (error) throw error;
    locked = true;
    showOnly(doneCard);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    setFormError(error.message || 'Impossible d’envoyer le formulaire. Réessayez.');
    submitButton.disabled = false;
    submitButton.textContent = 'Envoyer à mon coach';
  }
});

window.addEventListener('pagehide', () => {
  if (locked || !supabase || !token) return;
  void saveDraft({ quiet: true });
});

boot();
