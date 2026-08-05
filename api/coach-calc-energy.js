/**
 * POST /api/coach-calc-energy
 * Authenticated EER / IOM / NASEM / TDEE calculation.
 * Returns bmr/tdee/method/goals only — never coefficients.
 */

module.exports = async function handler(req, res) {
  const { createCoachApiHandler } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validateEnergyBody } = await import(
    '../src/coach/server/validation/request-validators.mjs'
  );
  const { calculateEnergyNeeds } = await import(
    '../src/coach/server/calc/energy.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'calc-energy',
    validate: validateEnergyBody,
    async handle({ input }) {
      return calculateEnergyNeeds(input);
    },
  });

  return route(req, res);
};
