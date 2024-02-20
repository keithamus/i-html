export function onRequest() {
  return new Response(
    `
    <!doctype html>
    <body>
      ${new Date().toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
    </body>
  `,
    { headers: { "Content-Type": "text/html" } },
  );
}
