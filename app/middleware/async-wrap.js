export function wrapRouter(router) {
  const methods = ['get', 'post', 'put', 'delete'];
  methods.forEach(method => {
    const orig = router[method].bind(router);
    router[method] = (path, ...handlers) => orig(path, ...handlers.map(h =>
      h.constructor.name === 'AsyncFunction'
        ? (req, res, next) => h(req, res, next).catch(next)
        : h
    ));
  });
  return router;
}
