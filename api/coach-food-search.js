/**
 * POST /api/coach-food-search
 * Authenticated paginated food search (never returns the full bank).
 */

module.exports = async function handler(req, res) {
  const { createCoachApiHandler, httpError } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validateFoodSearchBody } = await import(
    '../src/coach/server/validation/request-validators.mjs'
  );
  const { loadCoachData } = await import(
    '../src/coach/server/food-bank/load-coach-data.mjs'
  );
  const { searchFoods } = await import(
    '../src/coach/server/search/search-foods.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'food-search',
    validate: validateFoodSearchBody,
    async handle({ input }) {
      const loaded = loadCoachData();
      if (!loaded.ok) return httpError('unavailable');
      return searchFoods(loaded.data, {
        q: input.q,
        category: input.category,
        limit: input.limit,
        offset: input.offset,
      });
    },
  });

  return route(req, res);
};
