import { onRequest as __date_js_onRequest } from "/home/keith/Code/i-html/example-apps/todoie/functions/date.js"

export const routes = [
    {
      routePath: "/date",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__date_js_onRequest],
    },
  ]