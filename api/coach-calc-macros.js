/**
 * POST /api/coach-calc-macros
 * Authenticated calorie goals + protein/carb/fat targets + hydration.
 */

module.exports = async function handler(req, res) {
  const { createCoachApiHandler } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validateMacrosBody } = await import(
    '../src/coach/server/validation/request-validators.mjs'
  );
  const { calculateMacroTargets } = await import(
    '../src/coach/server/calc/macros.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'calc-macros',
    validate: validateMacrosBody,
    async handle({ input }) {
      return calculateMacroTargets(input);
    },
  });

  return route(req, res);
};
