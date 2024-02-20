				import worker, * as OTHER_EXPORTS from "/home/keith/Code/i-html/example-apps/todoie/.wrangler/tmp/pages-3Tm6u6/functionsWorker-0.5306183402520004.mjs";
				import * as __MIDDLEWARE_0__ from "/home/keith/.cache/yay/companion/src/npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts";
				const envWrappers = [__MIDDLEWARE_0__.wrap].filter(Boolean);
				const facade = {
					...worker,
					envWrappers,
					middleware: [
						__MIDDLEWARE_0__.default,
            ...(worker.middleware ? worker.middleware : []),
					].filter(Boolean)
				}
				export * from "/home/keith/Code/i-html/example-apps/todoie/.wrangler/tmp/pages-3Tm6u6/functionsWorker-0.5306183402520004.mjs";

				const maskDurableObjectDefinition = (cls) =>
					class extends cls {
						constructor(state, env) {
							let wrappedEnv = env
							for (const wrapFn of envWrappers) {
								wrappedEnv = wrapFn(wrappedEnv)
							}
							super(state, wrappedEnv);
						}
					};
				

				export default facade;