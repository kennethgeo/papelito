// One-label pages.dev alias; forwards requests internally to the vinext Worker.
const pagesAlias = {
  fetch(request, env) {
    return env.PAPELITO_WEB.fetch(request);
  },
};

export default pagesAlias;
