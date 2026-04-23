interface Env {
  BASIC_AUTH_USER: string;
  BASIC_AUTH_PASS: string;
}

const unauthorized = () =>
  new Response("401 Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="szkoladlaola", charset="UTF-8"',
    },
  });

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let user: string;
  let pass: string;
  try {
    [user, pass] = atob(header.slice(6)).split(":", 2);
  } catch {
    return unauthorized();
  }

  if (user !== env.BASIC_AUTH_USER || pass !== env.BASIC_AUTH_PASS) {
    return unauthorized();
  }

  return next();
};
