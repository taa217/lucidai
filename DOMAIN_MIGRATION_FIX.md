# Domain Migration Fix: Invalid Redirect URI

You recently changed the domain structure:
- **Website**: `https://lucid-ai.co`
- **Web App**: `https://app.lucid-ai.co`

The error "Invalid redirect URI" occurs because WorkOS and your application environment variables are still configured for the old domain (`lucid-ai.co`) or are missing the new subdomain (`app.lucid-ai.co`).

## Step 1: Update Vercel Environment Variables

Go to your Vercel project for the **App** (frontend) and update the following environment variables. If you have separate projects for website and app, ensure these are set on the **App** project.

| Variable | Old Value | **New Value** |
|----------|-----------|---------------|
| `REACT_APP_WORKOS_REDIRECT_URI` | `https://lucid-ai.co/auth/callback` | `https://app.lucid-ai.co/auth/callback` |
| `REACT_APP_WORKOS_ALLOWED_REDIRECT_URIS` | `...,https://lucid-ai.co/auth/callback` | `http://localhost:3000/auth/callback,https://app.lucid-ai.co/auth/callback` |
| `REACT_APP_WORKOS_CALLBACK_PATH` | `/auth/callback` | `/auth/callback` (No change) |

**Important**: After updating the environment variables, you must **Redeploy** your application for changes to take effect.

## Step 2: Update WorkOS Dashboard

1. Log in to [WorkOS Dashboard](https://dashboard.workos.com/).
2. Go to **Redirects**.
3. Add the new Redirect URI:
   - `https://app.lucid-ai.co/auth/callback`
4. (Optional) You can keep `https://lucid-ai.co/auth/callback` if you still have auth on the main site, but primarily you need the `app.` subdomain.
5. Update **Logout Redirects** to include `https://app.lucid-ai.co`.

## Step 3: Verify Backend CORS (If applicable)

If your backend restricts CORS origins, ensure `https://app.lucid-ai.co` is allowed in your backend environment variables (`CORS_ORIGIN` or similar).

## Step 4: Test

1. Go to `https://app.lucid-ai.co`.
2. Click Login.
3. The error should be gone, and you should be redirected to WorkOS and back to the app successfully.

