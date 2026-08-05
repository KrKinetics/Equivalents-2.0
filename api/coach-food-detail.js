/**
 * POST /api/coach-food-detail
 * Authenticated single-food detail (display fields only).
 */

module.exports = async function handler(req, res) {
  const { createCoachApiHandler, httpError } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validateFoodDetailBody } = await import(
    '../src/coach/server/validation/request-validators.mjs'
  );
  const { loadCoachData } = await import(
    '../src/coach/server/food-bank/load-coach-data.mjs'
  );
  const { getFoodDetail } = await import(
    '../src/coach/server/search/food-detail.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'food-detail',
    validate: validateFoodDetailBody,
    async handle({ input }) {
      const loaded = loadCoachData();
      if (!loaded.ok) return httpError('unavailable');
      const detail = getFoodDetail(loaded.data, input.id);
      if (!detail.ok) return httpError('not_found');
      return { food: detail.food };
    },
  });

  return route(req, res);
};
