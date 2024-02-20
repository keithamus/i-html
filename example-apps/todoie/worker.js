import index from "./index.html";
// import indexCss from "./index.css.txt";
import indexCss from "./index.css" assert { type: 'html' };
import notFound from "./not-found.html";

/** A mini router **/
const routes = new Map();
const get = (pathname, handler) => {
  if (!routes.has("GET")) routes.set("GET", new Map());
  routes.get("GET").set(new URLPattern({ pathname }), handler);
};
const getFile = (pathname, file, type, init) => 
  get(
    pathname,
    async () =>
      new Response(await file, {
        headers: { "Content-Type": type },
        ...init
      }),
  );
const html = (pathname, file, init) => getFile(pathname, file, 'text/html', init)
const css = (pathname, file) => getFile(pathname, file, 'text/css', init)
const handler = {
  fetch(req, env, ctx) {
    const url = new URL(req.url);
    for (const [pattern, handler] of routes.get(req.method)) {
      if (pattern.test(url)) return handler(req, env, ctx);
    }
  },
};
/** Mini router end **/

/** Declare routes */
html("/", index);
html("/index.css", indexCss);

// This one always goes last.
html("/*", notFound, { status: 404 });

export default handler;
