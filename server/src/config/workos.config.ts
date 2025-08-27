import { registerAs } from '@nestjs/config';

export default registerAs('workos', () => ({
  apiKey: process.env.WORKOS_API_KEY,
  clientId: process.env.WORKOS_CLIENT_ID,
  cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
  redirectUri: process.env.WORKOS_REDIRECT_URI || 'http://localhost:8081/auth/callback',
})); 