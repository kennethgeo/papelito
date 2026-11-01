// One-label pages.dev alias; forwards requests internally to the vinext Worker.
export default {
  fetch(request, env) {
    return env.PAPELITO_WEB.fetch(request);
  },
};
