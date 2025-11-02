const DEFAULT_CORS_ORIGINS: (string | RegExp)[] = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:19000',
  'exp://localhost:19000',
  /^http:\/\/10\.0\.2\.2:(19000|19006|8081)$/,
  /^http:\/\/192\.168\.\d+\.\d+:(19000|19006|8081)$/,
  /^http:\/\/10\.\d+\.\d+\.\d+:(19000|19006|8081)$/,
  /^http:\/\/172\.\d+\.\d+\.\d+:(19000|19006|8081)$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/([a-z0-9-]+\.)?lucid-ai\.co$/i,
];

const asOrigin = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('/')) {
    return null;
  }

  const attempts: string[] = [];
  if (/^https?:\/\//i.test(trimmed)) {
    attempts.push(trimmed);
  } else {
    attempts.push(`http://${trimmed}`);
    attempts.push(`https://${trimmed}`);
  }

  for (const attempt of attempts) {
    try {
      const origin = new URL(attempt).origin;
      if (origin) {
        return origin;
      }
    } catch (error) {
      // ignore and try next attempt
    }
  }

  return null;
};

const collectOriginsFromList = (value?: string | null): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => asOrigin(entry))
    .filter((origin): origin is string => Boolean(origin));
};

export const buildCorsOrigins = (env: NodeJS.ProcessEnv): (string | RegExp)[] => {
  const stringOrigins = new Set<string>();

  const add = (origin?: string | null) => {
    if (!origin) {
      return;
    }
    stringOrigins.add(origin);
  };

  collectOriginsFromList(env.CORS_ORIGIN).forEach(add);
  collectOriginsFromList(env.CORS_ORIGINS).forEach(add);

  const frontendOrigin = asOrigin(env.FRONTEND_URL);
  if (frontendOrigin) {
    add(frontendOrigin);
  }

  const redirectOrigin = asOrigin(env.WORKOS_REDIRECT_URI);
  if (redirectOrigin) {
    add(redirectOrigin);
  }

  collectOriginsFromList(env.WORKOS_ALLOWED_REDIRECT_URIS).forEach(add);

  if (env.VERCEL_URL) {
    add(`https://${env.VERCEL_URL}`);
  }

  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    add(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }

  const origins: (string | RegExp)[] = [...DEFAULT_CORS_ORIGINS];
  stringOrigins.forEach((origin) => origins.push(origin));

  return origins;
};

