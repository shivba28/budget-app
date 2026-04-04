# WebAuthn/Passkey Authentication Implementation Prompt

## Project Overview
Replace the existing 4-digit PIN authentication system with WebAuthn/Passkey (Face ID, fingerprint) for the budget tracker PWA. The flow:
1. User logs in with Google OAuth (existing)
2. First login: User is prompted to register a passkey on their device
3. Subsequent logins (up to 30 days): Passkey authentication only
4. After 30 days or logout: Requires Google login again
5. Fallback: If no passkey, user logs in with Google again

**Key constraint**: Google login is STILL required first to save data to Google Drive. Passkeys only replace the PIN for device-specific access to the app.

---

## Architecture & Design

### Current System (What You're Replacing)
- **PIN Storage**: Server-side bcrypt hash at `data/user-pins.json`
- **PIN Structure**: Keyed by Google user `sub`, stores `{ pinHash, updatedAt }`
- **Session State**: `pinVerifiedUntil` field in `data/sessions.json`
- **Duration**: PIN verified for 7 days

### New System (What You're Building)
- **Credential Storage**: New file `data/user-credentials.json` (parallel to PIN storage, initially)
- **Credential Structure**: Array of credentials per user, each with:
  ```
  {
    id: "credential-id-base64",
    publicKey: "base64-encoded-public-key",
    counter: 0,
    transports: ["internal"],
    device: "iPhone 15",
    createdAt: "ISO-8601-timestamp",
    lastUsedAt: "ISO-8601-timestamp"
  }
  ```
- **Session State**: Keep existing `pinVerifiedUntil` (rename to `verifiedAt` or `authVerifiedUntil` if clearer)
- **Duration**: Same as PIN (7 days initially, or increase to 30 days as discussed)
- **Registration Flow**: Offered immediately after successful Google login

---

## Libraries & Dependencies

### Server-Side
- `@simplewebauthn/server@^10.0.0` (or latest)
  - Handles `verifyRegistrationResponse()`
  - Handles `verifyAuthenticationResponse()`
  - Generates challenges
  - Validates signatures and attestation

### Client-Side (Browser)
- `@simplewebauthn/browser@^10.0.0` (or latest)
  - `startRegistration()` — initiates passkey creation
  - `startAuthentication()` — initiates passkey auth
  - Device feature detection

### Optional
- TypeScript types from SimpleWebAuthn (included in packages)

---

## Database/Storage Schema

### New File: `data/user-credentials.json`

```json
{
  "credentials": {
    "google-user-sub-123": [
      {
        "id": "base64-encoded-credential-id",
        "publicKey": "base64-encoded-public-key",
        "counter": 42,
        "transports": ["internal"],
        "device": "iPhone 15 Pro",
        "createdAt": "2026-04-02T14:30:00Z",
        "lastUsedAt": "2026-04-02T15:45:00Z",
        "name": "iPhone"
      },
      {
        "id": "another-credential-id",
        "publicKey": "another-public-key",
        "counter": 18,
        "transports": ["internal"],
        "device": "MacBook Pro",
        "createdAt": "2026-03-15T10:00:00Z",
        "lastUsedAt": "2026-04-01T09:30:00Z",
        "name": "MacBook"
      }
    ]
  }
}
```

### Modifications to Existing Files

**`data/sessions.json`** (update structure):
- Keep `userId` (Google sub)
- Keep `sessionToken`
- Keep `createdAt`
- Rename `pinVerifiedUntil` → `authVerifiedUntil` (or keep name, just use it for both PIN and passkey)
- Add `authMethod: "pin" | "passkey" | "google"` (optional, for logging)
- Keep `expiresAt`

**`data/user-pins.json`** (keep as-is initially):
- Don't remove PIN storage yet (keeps backwards compatibility)
- You can migrate users away from PIN over time, or keep both

---

## API Endpoints to Implement

### 1. **GET `/api/auth/webauthn/register/check`**
**Purpose**: Check if user has passkeys registered on this device/browser.

**Request**:
- No body (user context from session)

**Response**:
```json
{
  "hasPasskeys": true,
  "credentialCount": 2,
  "lastUsedAt": "2026-04-02T15:45:00Z"
}
```

**Security**:
- Require valid Google OAuth session
- Only return data for the authenticated user

---

### 2. **POST `/api/auth/webauthn/register/start`**
**Purpose**: Generate a challenge for passkey registration.

**Request**:
```json
{
  "device": "iPhone 15"
}
```

**Response**:
```json
{
  "challenge": "random-base64-string",
  "rp": {
    "id": "yourdomain.com",
    "name": "Budget Tracker"
  },
  "user": {
    "id": "user-google-sub-base64",
    "name": "user@example.com",
    "displayName": "John Doe"
  },
  "timeout": 300000,
  "attestation": "direct",
  "userVerification": "required",
  "residentKey": "preferred"
}
```

**Security**:
- Require valid Google OAuth session
- Challenge is cryptographically random (use `crypto.randomBytes(32)`)
- Challenge expires after 5 minutes
- Store challenge in memory or a temporary table with expiration
- `rp.id` MUST match your production domain (e.g., `yourdomain.com`, NOT `api.yourdomain.com`)
- `userVerification: "required"` — enforce biometric
- `residentKey: "preferred"` — allow passkey to work on same device

---

### 3. **POST `/api/auth/webauthn/register/verify`**
**Purpose**: Verify the passkey registration response and store the credential.

**Request**:
```json
{
  "challenge": "original-challenge",
  "id": "credential-id-from-authenticator",
  "rawId": "base64-raw-id",
  "response": {
    "clientDataJSON": "base64",
    "attestationObject": "base64"
  },
  "type": "public-key",
  "device": "iPhone 15"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Passkey registered successfully",
  "credentialId": "...",
  "device": "iPhone 15"
}
```

**Error Responses**:
```json
{
  "success": false,
  "error": "challenge_expired",
  "message": "Registration challenge expired. Please start again."
}
```

**Security Checks** (ALL MUST PASS):
1. ✅ Verify Google OAuth session exists and is valid
2. ✅ Challenge exists in temporary storage and hasn't expired (5 min max)
3. ✅ Challenge matches the one sent in the request
4. ✅ `rp.id` matches your domain
5. ✅ Attestation object is valid (use `verifyRegistrationResponse()`)
6. ✅ Public key is successfully extracted
7. ✅ Credential ID is unique (not already registered for this user)
8. ✅ Counter is initialized to 0
9. ✅ Clean up the used challenge immediately

**Action**:
- Extract public key from attestation object
- Store credential in `data/user-credentials.json`
- Log the registration event with timestamp
- Delete the temporary challenge

**Error Handling**:
- Invalid attestation → 400 Bad Request
- Challenge expired → 400 Bad Request
- Credential already exists → 409 Conflict
- Any crypto error → 500 Internal Server Error

---

### 4. **POST `/api/auth/webauthn/authenticate/start`**
**Purpose**: Generate a challenge for passkey authentication.

**Request** (from unauthenticated user):
```json
{
  "userId": "google-sub-from-query-param-or-body"
}
```

OR (from authenticated session, simpler):
```json
{}
```

**Response**:
```json
{
  "challenge": "random-base64-string",
  "timeout": 300000,
  "userVerification": "required",
  "allowCredentials": [
    {
      "id": "credential-id-base64",
      "type": "public-key",
      "transports": ["internal"]
    },
    {
      "id": "another-credential-id",
      "type": "public-key",
      "transports": ["internal"]
    }
  ]
}
```

**Security**:
- Challenge is cryptographically random
- Challenge expires after 5 minutes
- `allowCredentials` lists only credentials registered for this user
- `userVerification: "required"` — enforce biometric
- If user ID not in session, require it as a parameter (but don't store it yet; only use for challenge generation)

---

### 5. **POST `/api/auth/webauthn/authenticate/verify`**
**Purpose**: Verify passkey authentication and issue a new session.

**Request**:
```json
{
  "challenge": "original-challenge",
  "id": "credential-id",
  "rawId": "base64-raw-id",
  "response": {
    "clientDataJSON": "base64",
    "authenticatorData": "base64",
    "signature": "base64"
  },
  "type": "public-key"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Authentication successful",
  "sessionToken": "new-session-token",
  "expiresAt": "2026-05-02T14:30:00Z",
  "user": {
    "sub": "google-user-sub",
    "email": "user@example.com"
  }
}
```

**Error Responses**:
```json
{
  "success": false,
  "error": "invalid_signature",
  "message": "Passkey authentication failed. Please try again."
}
```

**Security Checks** (ALL MUST PASS):
1. ✅ Challenge exists in temporary storage and hasn't expired (5 min max)
2. ✅ Challenge matches the one sent in the request
3. ✅ Credential ID exists and belongs to a valid user
4. ✅ `clientDataJSON.type === "webauthn.get"`
5. ✅ `clientDataJSON.challenge` matches the challenge sent
6. ✅ Origin matches your domain (no phishing)
7. ✅ Public key is retrieved from storage
8. ✅ Signature is verified against the challenge and authenticator data
9. ✅ Counter is incremented and verified (CRITICAL: reject if counter goes backwards, indicates cloned credential)
10. ✅ User verification flag is set (biometric was used)

**Action**:
- Increment the credential's counter in storage
- Update `lastUsedAt` timestamp for the credential
- Generate new session token (or reuse existing session)
- Set `authVerifiedUntil` to current time + 7 days (or 30 days)
- Set `authMethod: "passkey"` in session
- Delete the temporary challenge
- Log successful authentication

**Error Handling**:
- Invalid signature → 401 Unauthorized
- Counter decreased (cloned credential) → 401 Unauthorized + log security alert
- Challenge expired → 400 Bad Request
- Credential not found → 401 Unauthorized
- Any crypto error → 500 Internal Server Error

---

## Client-Side Implementation

### Flow 1: Registration (After Google Login)

1. **Google login succeeds** → Session is created
2. **Check for existing passkeys** → GET `/api/auth/webauthn/register/check`
3. **If no passkeys**: Show modal/screen: "Secure this device with Face ID? [Register Now] [Later]"
4. **If user clicks "Register Now"**:
   - Call POST `/api/auth/webauthn/register/start` (get challenge)
   - Call `browser.startRegistration()` with challenge
   - User confirms with biometric
   - Call POST `/api/auth/webauthn/register/verify` with response
   - Show success: "Passkey registered! You can now unlock with Face ID."
5. **If user clicks "Later"** or registration fails: Proceed to app normally

### Flow 2: Authentication (Session Expired)

1. **App loads** → Check if session is valid
2. **If session expired**:
   - Show modal: "This device is locked. Unlock with Face ID?"
   - Call POST `/api/auth/webauthn/authenticate/start` (get challenge)
   - Call `browser.startAuthentication()` with challenge
   - User confirms with biometric
   - Call POST `/api/auth/webauthn/authenticate/verify` with response
   - New session is created, app unlocks
3. **If passkey not available or auth fails**:
   - Show: "Face ID not available. Log in with Google instead?"
   - Redirect to Google login

---

## Security Requirements (Mandatory)

### Cryptography & Challenge Management
- [ ] All challenges are generated with `crypto.randomBytes(32)` (or higher entropy)
- [ ] All challenges are stored with a 5-minute expiration timestamp
- [ ] All challenges are deleted immediately after use (success or failure)
- [ ] No challenge is reused
- [ ] All public keys are Base64-encoded and stored safely
- [ ] Counter starts at 0 and increments by 1 on every successful auth
- [ ] Counter MUST be verified: reject if `storedCounter >= newCounter` (indicates clone or replay)

### Domain & Origin Binding
- [ ] `rp.id` is set to your production domain (e.g., `yourdomain.com`)
- [ ] `origin` in `clientDataJSON` is verified to match your domain
- [ ] No subdomains in `rp.id` — use the bare domain
- [ ] In development, `rp.id` can be `localhost` but HTTPS is still required for production

### HTTPS Enforcement
- [ ] All WebAuthn endpoints require HTTPS in production
- [ ] Redirect HTTP to HTTPS with `Strict-Transport-Security` header
- [ ] Set `Secure` flag on session cookies
- [ ] Set `SameSite=Strict` on session cookies
- [ ] Certificate pinning recommended (optional but strengthens phishing defense)

### Session Security
- [ ] `authVerifiedUntil` is stored server-side (not sent to client unless necessary)
- [ ] Session tokens are cryptographically random (`crypto.randomBytes(32)`)
- [ ] Session tokens are hashed before storage (use bcrypt or argon2)
- [ ] Session cookie has `HttpOnly` flag (JavaScript cannot access it)
- [ ] Session cookie has `Secure` flag (sent only over HTTPS)
- [ ] Session cookie has `SameSite=Strict` (prevents CSRF)

### User Verification
- [ ] `userVerification: "required"` on both registration and authentication
- [ ] This ensures the user unlocked their device with biometric/PIN
- [ ] Server must verify `userVerified === true` in `authenticatorData`

### Rate Limiting
- [ ] Max 5 failed authentication attempts per user per hour
- [ ] After 5 failures, lock the user for 1 hour
- [ ] Log all failed attempts with IP address and timestamp
- [ ] Implement exponential backoff: 1st failure = immediate retry, 2nd = 30s wait, 3rd = 5 min, 4th = 15 min, 5th = 1 hour

### Credential Counter (Clone Detection)
- [ ] Counter is stored alongside each credential
- [ ] Counter is incremented on every successful auth
- [ ] On auth, verify: `storedCounter < newCounter` (strict less-than)
- [ ] If `storedCounter >= newCounter`, reject and log security alert
- [ ] This prevents an attacker from using a cloned credential after the original is used

### Attestation Verification
- [ ] Use `@simplewebauthn/server`'s `verifyRegistrationResponse()` which validates attestation
- [ ] For consumer devices (iPhone, Android), `attestation: "direct"` is sufficient
- [ ] For enterprise security, you can add attestation statement verification (optional)
- [ ] Metadata service (FIDO MDS) can be used to check if authenticator is genuine (optional for personal app)

### Logging & Monitoring
- [ ] Log all registration attempts (success + failure)
- [ ] Log all authentication attempts (success + failure)
- [ ] Log failed attempts with: user ID, timestamp, error reason, IP address
- [ ] Log successful auths with: user ID, credential ID, device, timestamp
- [ ] Log counter mismatches (potential cloning) immediately as a security alert
- [ ] Log challenge expirations
- [ ] Never log private keys or private data

### Account Recovery
- [ ] User loses all devices → Must log in with Google again
- [ ] Ensure Google login is always an option
- [ ] Consider optional backup codes (10 one-time codes printed on registration)
- [ ] Consider email-based recovery (send reset link via registered email)

### Backwards Compatibility
- [ ] Existing PIN system continues to work (don't break existing users)
- [ ] Passkey is opt-in (not mandatory on first login)
- [ ] Users can have both PIN and passkeys registered
- [ ] Gradually migrate users from PIN to passkey (show prompts)

---

## Testing & Validation

### Device Testing Required
- [ ] iOS 16+ (Face ID and Touch ID)
- [ ] Android 9+ (fingerprint, face, pattern)
- [ ] Windows 10+ (Windows Hello, security keys)
- [ ] macOS 13+ (Face ID, Touch ID)
- [ ] Test on 2+ devices per OS (cross-device sync behavior)

### Scenarios to Test
1. **Registration Flow**
   - [ ] Register passkey on iOS → confirm Face ID works
   - [ ] Register passkey on Android → confirm fingerprint works
   - [ ] Register second passkey on same device → confirm both stored
   - [ ] Cancel registration → confirm no credential stored
   - [ ] Register with invalid/expired challenge → confirm rejection

2. **Authentication Flow**
   - [ ] Auth with passkey on iOS → confirm Face ID prompt
   - [ ] Auth with passkey on Android → confirm fingerprint prompt
   - [ ] Auth with second credential on same device → confirm either works
   - [ ] Auth with invalid/expired challenge → confirm rejection
   - [ ] Auth with wrong user → confirm rejection

3. **Counter Verification**
   - [ ] Increment counter on every auth → verify counter increases
   - [ ] Try replaying old auth response → verify counter check rejects it
   - [ ] Clone credential (if possible in test) → verify counter prevents reuse

4. **Fallback Paths**
   - [ ] No passkey on device → prompt for Google login
   - [ ] Passkey auth fails → fallback to Google login
   - [ ] Session expired → lockscreen with passkey option
   - [ ] User logs out → next visit requires Google login

5. **Edge Cases**
   - [ ] Challenge expires (>5 min) → confirm rejection
   - [ ] Multiple registrations in quick succession → confirm only latest stored
   - [ ] Rate limit exceeded → confirm lockout after 5 failures
   - [ ] Browser doesn't support WebAuthn → graceful fallback to Google

---

## Implementation Order (Recommended)

1. **Phase 1: Storage & Data Model**
   - [ ] Create `data/user-credentials.json` structure
   - [ ] Update session schema to support `authMethod` field
   - [ ] Create `WebAuthnStore` class (read/write credentials)
   - [ ] Create `ChallengeStore` class (temporary challenge storage with expiration)

2. **Phase 2: Server Endpoints (Core)**
   - [ ] Implement `POST /webauthn/register/start`
   - [ ] Implement `POST /webauthn/register/verify`
   - [ ] Implement `POST /webauthn/authenticate/start`
   - [ ] Implement `POST /webauthn/authenticate/verify`

3. **Phase 3: Security Hardening**
   - [ ] Add counter verification in `/authenticate/verify`
   - [ ] Add rate limiting (5 failures per hour)
   - [ ] Add HTTPS redirect with security headers
   - [ ] Add comprehensive logging

4. **Phase 4: Client-Side UI**
   - [ ] Registration prompt after Google login
   - [ ] Authentication UI for locked sessions
   - [ ] Error handling & fallback flows
   - [ ] Device detection (feature availability)

5. **Phase 5: Testing**
   - [ ] Unit tests for crypto operations
   - [ ] Integration tests for endpoints
   - [ ] Manual testing on real devices
   - [ ] Security review of counter/challenge handling

6. **Phase 6: Migration**
   - [ ] Deploy to production
   - [ ] Monitor for errors
   - [ ] Gradually prompt existing users to register passkeys
   - [ ] Plan PIN deprecation (optional)

---

## Migration from PIN System

### Option A: Gradual Phaseout (Recommended)
1. **Month 1**: Deploy passkey system alongside PIN
2. **Month 2**: Show "Register passkey" prompt to all users
3. **Month 3+**: Gradually deprecate PIN (show prompts, reduce PIN duration)

### Option B: Full Replacement
1. Delete `user-pins.json`
2. Require passkey registration on next login
3. Keep Google login as fallback

### Option C: Keep Both (Most Flexible)
1. Keep PIN storage
2. Add passkey alongside
3. Users can use either or both
4. Gradually encourage passkey migration

---

## Deployment Architecture: Render Backend + Vercel Frontend

### Infrastructure Overview
```
Vercel Frontend (https://your-app.vercel.app)
        ↓ (HTTPS API calls)
Render Backend (https://your-api.onrender.com)
        ↓
File Storage (data/*.json)
```

### Critical: Domain & Origin Configuration

**Your setup will have these domains:**
- **Frontend**: `https://your-app.vercel.app` (Vercel-provided subdomain)
- **Backend API**: `https://your-api.onrender.com` (Render-provided subdomain)
- **Custom Domain (optional)**: `https://yourdomain.com` (if you add one)

**Impact on WebAuthn:**
- `rp.id` MUST match the domain where the user types in their browser
  - If using Vercel subdomain only: `rp.id = "your-app.vercel.app"`
  - If using custom domain: `rp.id = "yourdomain.com"`
  - **Cannot mix** — if frontend is on Vercel's subdomain, you MUST set `rp.id` to that
- `origin` in `clientDataJSON` is automatically set to wherever the browser loaded the app from
- Backend domain (`your-api.onrender.com`) is used only for API calls, NOT for `rp.id`

**Recommendation:**
- **For development/testing**: Use Vercel subdomain (`your-app.vercel.app`) as `rp.id`
- **For production**: Map custom domain to Vercel, set `rp.id` to custom domain for professionalism
- **If you don't have a custom domain yet**: Start with Vercel subdomain, migrate later (requires re-registering passkeys)

---

## Environment Variables & Configuration

### Add to `.env` (Render Backend)
```
# WebAuthn Configuration
WEBAUTHN_RP_ID=your-app.vercel.app
WEBAUTHN_RP_NAME=Budget Tracker
WEBAUTHN_ORIGIN=https://your-app.vercel.app
WEBAUTHN_ICON_URL=https://your-app.vercel.app/icon.png

# CORS Configuration (critical for Render + Vercel split)
FRONTEND_URL=https://your-app.vercel.app
FRONTEND_URL_DEV=http://localhost:3000
BACKEND_URL=https://your-api.onrender.com
BACKEND_URL_DEV=http://localhost:5000

# Session & Challenge
CHALLENGE_EXPIRATION_MS=300000
SESSION_DURATION_MS=2592000000
RATE_LIMIT_MAX_FAILURES=5
RATE_LIMIT_WINDOW_MS=3600000

# Storage (file-based on Render)
DATA_DIR=/var/data
```

### Add to Environment (Vercel Frontend)
```
NEXT_PUBLIC_API_URL=https://your-api.onrender.com
NEXT_PUBLIC_WEBAUTHN_RP_ID=your-app.vercel.app
```

### Validation:
- [ ] `WEBAUTHN_RP_ID` matches Vercel frontend domain (or custom domain)
- [ ] `WEBAUTHN_RP_ID` does NOT include `api.` prefix
- [ ] `WEBAUTHN_ORIGIN` is HTTPS only (both dev and prod)
- [ ] `FRONTEND_URL` matches Vercel deployment URL
- [ ] `BACKEND_URL` matches Render deployment URL
- [ ] Both URLs are HTTPS (critical for WebAuthn)
- [ ] `CHALLENGE_EXPIRATION_MS` is 5 minutes (300000)
- [ ] `SESSION_DURATION_MS` is 30 days (2592000000)

---

## CORS & Cross-Origin API Calls (Render + Vercel Split)

### Critical: CORS Headers on Render Backend

Since your frontend (Vercel) and backend (Render) are on **different domains**, you MUST configure CORS correctly.

**Add to your Render backend** (likely in Express middleware):
```javascript
const allowedOrigins = [
  process.env.FRONTEND_URL,  // https://your-app.vercel.app
  process.env.FRONTEND_URL_DEV  // http://localhost:3000
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
```

### Critical: Cookie Configuration (Cross-Domain)

Session cookies from Render backend will NOT work on Vercel frontend because they're cross-domain.

**Two Solutions:**

**Option A: Bearer Token (Recommended for SPA)**
- Don't use cookies at all
- Return JWT token in POST response body
- Client stores token in memory or localStorage
- Client sends token in `Authorization: Bearer <token>` header on every request
- **Pros**: Simple CORS, works across subdomains
- **Cons**: Token is vulnerable if stored in localStorage (XSS attack)

**Option B: Cross-Domain Cookies**
- Use `SameSite=None; Secure` on cookies
- Set `Origin` header explicitly
- Requires HTTPS (which you have with Render + Vercel)
- **Pros**: More secure (HttpOnly flag possible)
- **Cons**: Complex CORS setup, potential issues with third-party cookie restrictions

**Strongly recommend Option A (JWT/Bearer Token) for SPA:**

```javascript
// Render backend: POST /auth/webauthn/authenticate/verify
app.post('/auth/webauthn/authenticate/verify', (req, res) => {
  // ... verify passkey ...
  
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  // Store in sessions.json
  sessions[sessionToken] = {
    userId: user.sub,
    authVerifiedUntil: expiresAt,
    authMethod: 'passkey',
    createdAt: new Date()
  };
  
  // Return token in response body (not cookie)
  res.json({
    success: true,
    token: sessionToken,  // Client stores this
    expiresAt: expiresAt,
    user: { sub: user.sub, email: user.email }
  });
});
```

```javascript
// Vercel frontend: Store token & use for auth
localStorage.setItem('sessionToken', response.token);

// Vercel frontend: Fetch with token
fetch('https://your-api.onrender.com/api/budget/list', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
  }
});
```

```javascript
// Render backend: Middleware to validate token
app.use('/api/*', (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const session = sessions[token];
  if (new Date() > new Date(session.authVerifiedUntil)) {
    delete sessions[token];
    return res.status(401).json({ error: 'Session expired' });
  }
  req.user = { sub: session.userId };
  next();
});
```

### CORS Preflight Requests
- [ ] All POST requests to `/webauthn/*` endpoints will trigger CORS preflight (OPTIONS)
- [ ] Ensure OPTIONS requests return 200 with proper CORS headers
- [ ] No authentication needed for preflight requests

---

## Persistent Storage on Render (Critical Issue)

### Problem: Render Restarts Wipe File Storage

Render's free/standard tiers can restart your dyno (container) at any time. When they do:
- **Data in `/data` directory is LOST**
- Files like `user-credentials.json`, `sessions.json` are deleted
- Users' sessions expire, passkey registrations disappear

### Solutions:

**Option A: Use Render Disks (Recommended for Persistent JSON)**
- Render offers persistent disks that survive restarts
- Cost: ~$10/month per 10GB disk
- Setup: Mount disk at `/var/data` in Render dashboard
- Update `DATA_DIR=/var/data` in environment

```bash
# Render dashboard:
# Settings → Disks → Add Disk
# Mount path: /var/data
# Size: 1GB (plenty for JSON files)
```

**Option B: Use External Database (PostgreSQL, MongoDB)**
- Replace JSON file storage with real database
- Render offers free Postgres (limited)
- More robust and scalable
- **Recommended for production**

```javascript
// Instead of data/user-credentials.json:
// CREATE TABLE webauthn_credentials (
//   id UUID PRIMARY KEY,
//   user_id TEXT,
//   public_key TEXT,
//   counter INT,
//   created_at TIMESTAMP,
//   last_used_at TIMESTAMP,
//   UNIQUE(id)
// );
```

**Option C: Use Cloud Storage (Backblaze B2, S3)**
- Store JSON files in object storage
- Cheaper than Postgres, survives restarts
- Slightly slower (network I/O)
- Good for backups

**Option D: Accept Data Loss (Not Recommended)**
- Store in `/data` without persistence
- Users' passkeys/sessions lost on restart
- Very poor UX
- Only for personal dev/testing

**Strong Recommendation for Your App:**
1. **Short term** (MVP): Use Render Disk (`/var/data`), cost ~$10/month
2. **Medium term**: Migrate to PostgreSQL or MongoDB for better reliability
3. **Long term**: Add backup strategy (daily snapshots to S3, B2, or GitHub)

### Implementation for Render Disk:
```javascript
// server/src/config/env.ts
const DATA_DIR = process.env.DATA_DIR || '/var/data';

// Ensure directory exists on startup
import fs from 'fs';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Rest of storage logic remains the same
```

---

## Cold Starts & Performance (Render + Vercel)

### Render Backend Cold Start Issue

Render's free/standard tiers have **30-60 second cold starts** when:
- No requests for 15 minutes
- Dyno restarts
- Deployment happens

**Impact on WebAuthn:**
- First `/webauthn/register/start` or `/authenticate/start` might take 30+ seconds
- User sees slow response → thinks it failed
- Challenge might expire while waiting

**Solutions:**

**Option A: Keep-Alive Ping (Simple)**
```javascript
// Vercel frontend: Ping backend every 10 minutes
setInterval(() => {
  fetch('https://your-api.onrender.com/health', { method: 'GET' })
    .catch(() => {});  // Ignore errors
}, 10 * 60 * 1000);
```

**Option B: Upgrade Render Plan**
- Render Pro ($12/month) = no cold starts
- Standard ($7/month) = 15 min cold starts
- Free = same cold start issue but free

**Option C: Accept & Handle Gracefully**
```javascript
// Vercel frontend: Show loading state
const response = await Promise.race([
  fetch(...),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 45000)  // 45 sec timeout
  )
]).catch(err => {
  if (err.message === 'Timeout') {
    return { error: 'Server taking longer than expected. Please try again.' };
  }
  throw err;
});
```

**Recommendation:**
- During MVP/testing: Accept cold starts, show friendly timeout message
- For production: Upgrade to Render Standard ($7/month) or implement keep-alive ping

---

## Session Storage Across Render Restarts

### Problem: In-Memory Sessions Lost on Restart

If you store sessions only in memory (`const sessions = {}`):
```javascript
// BAD: Lost on restart
const sessions = {};
app.post('/webauthn/authenticate/verify', (req, res) => {
  sessions[token] = { ... };  // Forgotten on dyno restart
});
```

### Solution: Store Sessions in File or Database

**Use persistent file storage:**
```javascript
// Use /var/data (Render Disk) for sessions
const SESSION_FILE = path.join(process.env.DATA_DIR, 'sessions.json');

function loadSessions() {
  if (fs.existsSync(SESSION_FILE)) {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).sessions || {};
  }
  return {};
}

function saveSessions(sessions) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ sessions }, null, 2));
}

// On every session creation:
app.post('/webauthn/authenticate/verify', (req, res) => {
  sessions[token] = { ... };
  saveSessions(sessions);  // Persist immediately
  res.json({ token, ... });
});
```

### Alternative: Use sessionStorage Index

If you go with PostgreSQL/MongoDB later, sessions are automatically persistent.

---

## Temporary Challenge Storage (Render Restarts)

### Problem: Challenges Lost on Restart

If challenges expire in 5 minutes but Render restarts at 3 minutes:
```javascript
const challenges = {};
// Challenge stored, but...
// Dyno restarts → challenges = {} again
// User's registration attempt fails: "Challenge expired"
```

### Solution: Challenges Don't Need to Survive Restarts

Actually, this is fine:
- Challenge is valid for 5 minutes
- If Render restarts during those 5 minutes (rare), the user must start over
- Not a critical issue since registration is not time-sensitive
- User can just click "Register Passkey" again

**But if you want to be safe**, store challenges in persistent file too:
```javascript
const CHALLENGES_FILE = path.join(process.env.DATA_DIR, 'challenges.json');

function saveChallenges(challenges) {
  // Keep only non-expired challenges
  const valid = Object.entries(challenges)
    .filter(([_, c]) => new Date(c.expiresAt) > new Date())
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
  fs.writeFileSync(CHALLENGES_FILE, JSON.stringify({ challenges: valid }, null, 2));
}
```

---

## Deployment Checklist for Render + Vercel

### Render Backend Setup
- [ ] Backend deployed to Render at `https://your-api.onrender.com`
- [ ] Environment variables set in Render dashboard (WEBAUTHN_RP_ID, etc.)
- [ ] Render Disk mounted at `/var/data` (or database connected)
- [ ] CORS headers configured to allow `https://your-app.vercel.app`
- [ ] Keep-alive ping implemented OR upgraded to Standard plan ($7/month)
- [ ] HTTPS enforced (Render provides free SSL)
- [ ] Session storage uses persistent file/database, not memory

### Vercel Frontend Setup
- [ ] Frontend deployed to Vercel at `https://your-app.vercel.app`
- [ ] Environment variables set: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEBAUTHN_RP_ID`
- [ ] API calls use bearer token (not cookies)
- [ ] Token stored in localStorage or memory
- [ ] Token sent in `Authorization: Bearer <token>` header
- [ ] HTTPS enforced (Vercel provides free SSL)
- [ ] CORS pre-flight requests handled

### WebAuthn Configuration
- [ ] `rp.id` matches Vercel frontend domain (`your-app.vercel.app`)
- [ ] `origin` validation allows Vercel domain only
- [ ] Passkey registration works end-to-end
- [ ] Passkey authentication works end-to-end
- [ ] Tested on iOS, Android, Windows, macOS
- [ ] Fallback to Google login works if passkey unavailable

### Monitoring & Logs
- [ ] Render logs checked for errors on deployment
- [ ] Vercel logs checked for CORS errors
- [ ] API response times monitored (watch for cold starts)
- [ ] Failed authentication attempts logged on Render
- [ ] WebAuthn errors logged with full context

---

## Development Setup (Local Testing)

### Local Environment Variables

**Render Backend** (`.env.local`):
```
WEBAUTHN_RP_ID=localhost:5000
WEBAUTHN_ORIGIN=http://localhost:5000
FRONTEND_URL_DEV=http://localhost:3000
BACKEND_URL_DEV=http://localhost:5000
DATA_DIR=./data
```

### Local Testing Issue: Localhost WebAuthn

WebAuthn doesn't work on `localhost` in most browsers due to security restrictions.

**Solutions:**

**Option A: Use mkcert (Recommended)**
```bash
# Install mkcert
brew install mkcert

# Create local CA
mkcert -install

# Generate localhost certificate
mkcert localhost 127.0.0.1

# Run backend on HTTPS
NODE_TLS_REJECT_UNAUTHORIZED=0 npm start
```

**Option B: Use ngrok Tunnel**
```bash
# Install ngrok
brew install ngrok

# Start ngrok tunnel to localhost:5000
ngrok http 5000

# ngrok gives you: https://xxxx-xx-xxx-xx.ngrok.io
# Update WEBAUTHN_RP_ID=xxxx-xx-xxx-xx.ngrok.io
```

**Option C: Disable WebAuthn Verification (Dev Only)**
```javascript
// server/src/auth/webauthn.service.ts
if (process.env.NODE_ENV === 'development' && process.env.SKIP_WEBAUTHN_VERIFICATION) {
  // Skip origin/rp.id checks during local testing
  console.warn('⚠️  WebAuthn verification DISABLED (dev only)');
  return { valid: true };
}
```

**Strongly recommend Option A (mkcert)** for accurate local testing.

---

## Troubleshooting: Render + Vercel Specific Issues

### Issue 1: "CORS error: No 'Access-Control-Allow-Origin' header"
**Cause**: Backend CORS not configured for Vercel domain
**Fix**:
- [ ] Check `FRONTEND_URL` env var on Render matches Vercel URL
- [ ] Verify CORS middleware is running before route handlers
- [ ] Test with `curl -H "Origin: https://your-app.vercel.app" https://your-api.onrender.com/api/health`

### Issue 2: "Passkey registration slow" or "Timeout"
**Cause**: Render cold start (30-60 seconds)
**Fix**:
- [ ] Implement keep-alive ping
- [ ] Upgrade to Render Standard ($7/month)
- [ ] Show user-friendly loading message with longer timeout

### Issue 3: "After Render restart, users can't authenticate"
**Cause**: Sessions lost (stored in memory only)
**Fix**:
- [ ] Move sessions to persistent file (`/var/data`) or database
- [ ] Ensure `saveSessions()` is called on every change

### Issue 4: "Challenge expired immediately"
**Cause**: Render restart wipes challenges in memory
**Fix**:
- [ ] Store challenges in persistent file or accept that users restart registration

### Issue 5: "Passkey works on one device, not another"
**Cause**: Each device has its own credential; registration wasn't completed on second device
**Fix**:
- [ ] Confirm user registered passkey on second device
- [ ] Show device list so users know which devices are registered

### Issue 6: "Token sent in header not recognized"
**Cause**: Backend middleware expects cookie, not Authorization header
**Fix**:
- [ ] Add middleware to extract token from `Authorization: Bearer <token>` header
- [ ] Validate token against sessions file/database



### Common Issues
1. **"Passkey not available"**
   - Device doesn't support WebAuthn
   - Browser is outdated
   - HTTPS not enforced
   - `rp.id` doesn't match domain

2. **"Invalid signature"**
   - Challenge mismatch
   - Wrong credential used
   - Cloned credential (counter check)
   - Attestation failure

3. **"Counter mismatch"**
   - Cloned credential detected
   - Log security alert immediately
   - Reject authentication

4. **Cross-device passkey not working**
   - Each device has its own credential
   - Cross-device auth (QR code flow) is optional
   - Users must register separately on each device OR use OS sync (iCloud/Google)

---

## Documentation to Write

- [ ] API documentation for each endpoint
- [ ] Security design document (threat model)
- [ ] User guide (how to register & use passkeys)
- [ ] Developer guide (for future maintenance)
- [ ] Incident response plan (if credential cloning detected)

---

## Final Checklist Before Going to Production

- [ ] All 10 counter security checks implemented
- [ ] Rate limiting working (5 failures per hour)
- [ ] HTTPS enforced with security headers
- [ ] Challenge expiration working (5 min max)
- [ ] Session duration set correctly (30 days)
- [ ] Logging comprehensive and secure
- [ ] Error messages don't leak user information
- [ ] Fallback to Google login working
- [ ] Tested on iOS, Android, Windows, macOS
- [ ] Code reviewed for security
- [ ] Attestation verification working
- [ ] Counter increment verified (tested multiple auths)
- [ ] Cloned credential rejected (counter check)
- [ ] Rate limit tested (lock after 5 failures)
- [ ] Recovery path works (Google login)
