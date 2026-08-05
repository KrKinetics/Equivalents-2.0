/**
 * POST /api/coach-calc-portions
 * Authenticated portions, averages, suggestBanque, distribution, reconcile.
 */

module.exports = async function handler(req, res) {
  const { createCoachApiHandler, httpError } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validatePortionsBody } = await import(
    '../src/coach/server/validation/request-validators.mjs'
  );
  const { calculatePortions } = await import(
    '../src/coach/server/calc/portions.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'calc-portions',
    validate: validatePortionsBody,
    async handle({ input }) {
      const result = calculatePortions(input);
      if (result?.error === 'bad_request') return httpError('bad_request');
      return result;
    },
  });

  return route(req, res);
};
