/**
 * One Hobby-safe function for the food bank and nutrition calculators.
 * Public URLs stay on their original paths through vercel.json rewrites.
 * Each operation keeps its own validator, route name, and handler.
 */

function foodOp(req) {
  const url = String(req?.url || "");
  if (url.includes("coach-food-search") || /[?&]op=search(?:&|$)/.test(url)) return "search";
  if (url.includes("coach-food-detail") || /[?&]op=detail(?:&|$)/.test(url)) return "detail";
  if (url.includes("coach-calc-equivalences") || /[?&]op=equivalences(?:&|$)/.test(url)) return "equivalences";
  if (url.includes("coach-calc-energy") || /[?&]op=energy(?:&|$)/.test(url)) return "energy";
  if (url.includes("coach-calc-macros") || /[?&]op=macros(?:&|$)/.test(url)) return "macros";
  if (url.includes("coach-calc-portions") || /[?&]op=portions(?:&|$)/.test(url)) return "portions";
  return null;
}

async function handleSearch(req, res) {
  const { createCoachApiHandler, httpError } = await import("../src/coach/server/http/create-api-handler.mjs");
  const { validateFoodSearchBody } = await import("../src/coach/server/validation/request-validators.mjs");
  const { loadCoachData } = await import("../src/coach/server/food-bank/load-coach-data.mjs");
  const { searchFoods } = await import("../src/coach/server/search/search-foods.mjs");
  return createCoachApiHandler({
    routeName: "food-search",
    validate: validateFoodSearchBody,
    async handle({ input }) {
      const loaded = loadCoachData();
      if (!loaded.ok) return httpError("unavailable");
      return searchFoods(loaded.data, { q: input.q, category: input.category, limit: input.limit, offset: input.offset });
    },
  })(req, res);
}

async function handleDetail(req, res) {
  const { createCoachApiHandler, httpError } = await import("../src/coach/server/http/create-api-handler.mjs");
  const { validateFoodDetailBody } = await import("../src/coach/server/validation/request-validators.mjs");
  const { loadCoachData } = await import("../src/coach/server/food-bank/load-coach-data.mjs");
  const { getFoodDetail } = await import("../src/coach/server/search/food-detail.mjs");
  return createCoachApiHandler({
    routeName: "food-detail",
    validate: validateFoodDetailBody,
    async handle({ input }) {
      const loaded = loadCoachData();
      if (!loaded.ok) return httpError("unavailable");
      const detail = getFoodDetail(loaded.data, input.id);
      if (!detail.ok) return httpError("not_found");
      return { food: detail.food };
    },
  })(req, res);
}

async function handleEquivalences(req, res) {
  const { createCoachApiHandler, httpError } = await import("../src/coach/server/http/create-api-handler.mjs");
  const { validateEquivalencesBody } = await import("../src/coach/server/validation/request-validators.mjs");
  const { loadCoachData } = await import("../src/coach/server/food-bank/load-coach-data.mjs");
  const { listEquivalences } = await import("../src/coach/server/calc/equivalences.mjs");
  return createCoachApiHandler({
    routeName: "calc-equivalences",
    validate: validateEquivalencesBody,
    async handle({ input }) {
      const loaded = loadCoachData();
      if (!loaded.ok) return httpError("unavailable");
      return listEquivalences(loaded.data, { category: input.category, limit: input.limit, offset: input.offset });
    },
  })(req, res);
}

async function handleEnergy(req, res) {
  const { createCoachApiHandler } = await import("../src/coach/server/http/create-api-handler.mjs");
  const { validateEnergyBody } = await import("../src/coach/server/validation/request-validators.mjs");
  const { calculateEnergyNeeds } = await import("../src/coach/server/calc/energy.mjs");
  return createCoachApiHandler({
    routeName: "calc-energy",
    validate: validateEnergyBody,
    async handle({ input }) {
      return calculateEnergyNeeds(input);
    },
  })(req, res);
}

async function handleMacros(req, res) {
  const { createCoachApiHandler } = await import("../src/coach/server/http/create-api-handler.mjs");
  const { validateMacrosBody } = await import("../src/coach/server/validation/request-validators.mjs");
  const { calculateMacroTargets } = await import("../src/coach/server/calc/macros.mjs");
  return createCoachApiHandler({
    routeName: "calc-macros",
    validate: validateMacrosBody,
    async handle({ input }) {
      return calculateMacroTargets(input);
    },
  })(req, res);
}

async function handlePortions(req, res) {
  const { createCoachApiHandler, httpError } = await import("../src/coach/server/http/create-api-handler.mjs");
  const { validatePortionsBody } = await import("../src/coach/server/validation/request-validators.mjs");
  const { calculatePortions } = await import("../src/coach/server/calc/portions.mjs");
  return createCoachApiHandler({
    routeName: "calc-portions",
    validate: validatePortionsBody,
    async handle({ input }) {
      const result = calculatePortions(input);
      if (result?.error === "bad_request") return httpError("bad_request");
      return result;
    },
  })(req, res);
}

module.exports = async function handler(req, res) {
  const op = foodOp(req);
  if (op === "search") return handleSearch(req, res);
  if (op === "detail") return handleDetail(req, res);
  if (op === "equivalences") return handleEquivalences(req, res);
  if (op === "energy") return handleEnergy(req, res);
  if (op === "macros") return handleMacros(req, res);
  if (op === "portions") return handlePortions(req, res);
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(JSON.stringify({ error: "not_found" }));
};

module.exports.foodOp = foodOp;
