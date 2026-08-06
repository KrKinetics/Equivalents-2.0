import { getPortalSupabase } from './auth-session.js';

const token = new URLSearchParams(window.location.search).get('token') || '';
const loadingCard = document.getElementById('loading-card');
const errorCard = document.getElementById('error-card');
const errorMessage = document.getElementById('error-message');
const doneCard = document.getElementById('done-card');
const form = document.getElementById('intake-form');
const clientName = document.getElementById('client-name');
const brandName = document.getElementById('brand-name');
const progressBar = document.getElementById('progress-bar');
const stepLabel = document.getElementById('step-label');
const saveStatus = document.getElementById('save-status');
const formError = document.getElementById('form-error');
const backButton = document.getElementById('back-button');
const nextButton = document.getElementById('next-button');
const submitButton = document.getElementById('submit-button');
const steps = [...document.querySelectorAll('.intake-step')];
const stepItems = [...document.querySelectorAll('.intake-step-list li')];

let supabase;
let currentStep = 1;
let saving = false;
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
  if (message) formError.focus?.();
}

function setSaveStatus(message, state = '') {
  saveStatus.textContent = message;
  saveStatus.dataset.state = state;
}

function updateConditionalFields() {
  document.querySelectorAll('[data-condition-name]').forEach((container) => {
    const name = container.dataset.conditionName;
    const expected = container.dataset.conditionValue;
    const selected = form.querySelector(`[name="${CSS.escape(name)}"]:checked`);
    const visible = selected?.value === expected;
    container.classList.toggle('hidden', !visible);
    container.querySelectorAll('input, textarea, select').forEach((field) => {
      field.disabled = !visible;
      field.required = visible;
      if (!visible) field.value = '';
    });
  });
}

function readAnswers() {
  const answers = {};
  const data = new FormData(form);
  for (const [key, value] of data.entries()) {
    if (key === 'challenges') continue;
    answers[key] = typeof value === 'string' ? value.trim() : value;
  }
  answers.challenges = data.getAll('challenges').map((value) => String(value));
  answers.consent = document.getElementById('consent').checked;
  answers.completed_step = currentStep;
  return answers;
}

function applyAnswers(answers = {}) {
  for (const [name, value] of Object.entries(answers)) {
    if (name === 'challenges' && Array.isArray(value)) {
      form.querySelectorAll('[name="challenges"]').forEach((input) => {
        input.checked = value.includes(input.value);
      });
      continue;
    }
    if (name === 'consent') {
      document.getElementById('consent').checked = value === true;
      continue;
    }
    const controls = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
    controls.forEach((control) => {
      if (control.type === 'radio') control.checked = control.value === value;
      else if (control.type !== 'checkbox') control.value = value ?? '';
    });
  }
  updateConditionalFields();
}

function scrollToCard() {
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateStepUi() {
  steps.forEach((section) => {
    section.classList.toggle('hidden', Number(section.dataset.step) !== currentStep);
  });
  stepItems.forEach((item, index) => {
    item.classList.toggle('is-active', index + 1 === currentStep);
    item.classList.toggle('is-complete', index + 1 < currentStep);
  });
  stepLabel.textContent = `Étape ${currentStep} sur ${steps.length}`;
  progressBar.style.width = `${(currentStep / steps.length) * 100}%`;
  backButton.classList.toggle('hidden', currentStep === 1);
  nextButton.classList.toggle('hidden', currentStep === steps.length);
  submitButton.classList.toggle('hidden', currentStep !== steps.length);
  setFormError('');
}

function validateCurrentStep() {
  const section = steps[currentStep - 1];
  const requiredInputs = [...section.querySelectorAll('input[required], textarea[required], select[required]')]
    .filter((field) => !field.disabled);

  for (const field of requiredInputs) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }

  for (const group of section.querySelectorAll('[data-required]')) {
    const name = group.dataset.required;
    if (!group.querySelector(`[name="${CSS.escape(name)}"]:checked`)) {
      setFormError('Veuillez répondre à toutes les questions obligatoires avant de continuer.');
      group.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
  }

  if (currentStep === 3) {
    const challenges = section.querySelectorAll('[name="challenges"]:checked');
    if (challenges.length < 1 || challenges.length > 3) {
      setFormError('Choisissez entre un et trois défis principaux.');
      section.querySelector('.challenges-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
  }

  return true;
}

async function saveDraft({ quiet = false } = {}) {
  if (saving) return true;
  const answers = readAnswers();
  const snapshot = JSON.stringify(answers);
  if (snapshot === lastSavedSnapshot) return true;

  saving = true;
  if (!quiet) setSaveStatus('Sauvegarde…', 'saving');
  try {
    const { error } = await supabase.rpc('save_client_intake', {
      p_token: token,
      p_answers: answers,
    });
    if (error) throw error;
    lastSavedSnapshot = snapshot;
    setSaveStatus('Réponses sauvegardées', 'saved');
    return true;
  } catch (error) {
    setSaveStatus('Sauvegarde impossible', 'error');
    if (!quiet) setFormError(error.message || 'Impossible de sauvegarder vos réponses.');
    return false;
  } finally {
    saving = false;
  }
}

function setBrand(slug, name) {
  const isElevate = slug === 'elevate-fitness';
  document.body.dataset.brand = isElevate ? 'elevate' : 'kr';
  brandName.textContent = isElevate ? 'ELEVATE FITNESS' : 'KINETICS';
  document.title = `Préparation à notre rencontre | ${name || (isElevate ? 'Elevate Fitness' : 'KR Kinetics')}`;
}

async function boot() {
  if (!token) {
    showError('Le lien ne contient pas de jeton valide.');
    return;
  }

  try {
    supabase = getPortalSupabase();
    const { data, error } = await supabase.rpc('get_client_intake', { p_token: token });
    if (error) throw error;

    setBrand(data.organization_slug, data.organization_name);
    clientName.textContent = data.client_name ? `${data.client_name},` : '';

    if (data.invite_status === 'submitted' || data.response_status === 'submitted') {
      showOnly(doneCard);
      return;
    }

    applyAnswers(data.answers || {});
    const resumedStep = Number(data.answers?.completed_step || 1);
    currentStep = Number.isFinite(resumedStep) ? Math.min(Math.max(resumedStep, 1), steps.length) : 1;
    lastSavedSnapshot = JSON.stringify(readAnswers());
    updateStepUi();
    showOnly(form);
  } catch (error) {
    showError(error.message || 'Le lien est invalide, expiré ou a été remplacé.');
  }
}

form.addEventListener('change', (event) => {
  if (event.target.matches('[name="challenges"]')) {
    const selected = form.querySelectorAll('[name="challenges"]:checked');
    if (selected.length > 3) {
      event.target.checked = false;
      setFormError('Vous pouvez sélectionner un maximum de trois défis.');
    } else {
      setFormError('');
    }
  }
  updateConditionalFields();
});

nextButton.addEventListener('click', async () => {
  if (!validateCurrentStep()) return;
  const saved = await saveDraft();
  if (!saved) return;
  currentStep += 1;
  updateStepUi();
  scrollToCard();
});

backButton.addEventListener('click', async () => {
  await saveDraft({ quiet: true });
  currentStep = Math.max(1, currentStep - 1);
  updateStepUi();
  scrollToCard();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateCurrentStep()) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Envoi en cours…';
  setFormError('');

  try {
    const { error } = await supabase.rpc('submit_client_intake', {
      p_token: token,
      p_answers: readAnswers(),
    });
    if (error) throw error;
    showOnly(doneCard);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    setFormError(error.message || 'Impossible d’envoyer le formulaire. Réessayez.');
    submitButton.disabled = false;
    submitButton.textContent = 'Envoyer mes réponses';
  }
});

window.addEventListener('pagehide', () => {
  if (!supabase || !token || saving || form.classList.contains('hidden')) return;
  void saveDraft({ quiet: true });
});

boot();
