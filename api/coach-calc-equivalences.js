/**
 * POST /api/coach-calc-equivalences
 * Authenticated category equivalences (paginated; never full guide dump).
 */

module.exports = async function handler(req, res) {
  const { createCoachApiHandler, httpError } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validateEquivalencesBody } = await import(
    '../src/coach/server/validation/request-validators.mjs'
  );
  const { loadCoachData } = await import(
    '../src/coach/server/food-bank/load-coach-data.mjs'
  );
  const { listEquivalences } = await import(
    '../src/coach/server/calc/equivalences.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'calc-equivalences',
    validate: validateEquivalencesBody,
    async handle({ input }) {
      const loaded = loadCoachData();
      if (!loaded.ok) return httpError('unavailable');
      return listEquivalences(loaded.data, {
        category: input.category,
        limit: input.limit,
        offset: input.offset,
      });
    },
  });

  return route(req, res);
};
