# AI Content Studio — Architecture

---

## 1. System Overview

```
┌────────────────────────────────────────────────────────────┐
│                    NEXT.JS 15 BACKEND                       │
│               (App Router + API Routes)                     │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │              AGENT LOOP ORCHESTRATOR                │    │
│  │       Plan → Retrieve → Route → Execute → Assemble → Publish  │    │
│  └───────┬──────────────────────────┬─────────────┘    │
│          │                          │                    │
│          ▼                          ▼                    │
│  ┌──────────────┐          ┌──────────────────────┐    │
│  │   OPENAI      │          │     MUAPI.AI          │    │
│  │   GPT-4.1-mini│          │                      │    │
│  │               │          │  GENERATE:            │    │
│  │  • Captions   │          │  • 50+ image models  │    │
│  │  • Scripts    │          │  • 20+ video models  │    │
│  │  • Calendar   │          │  • Audio/lip-sync    │    │
│  │  • Hashtags   │          │  • Product photos    │    │
│  │  • Brand voice│          │                      │    │
│  │               │          │  PUBLISH ($0.01):     │    │
│  └───────────────┘          │  • YouTube ✅         │    │
│                              │  • TikTok ✅          │    │
│          │                   │  • Instagram ✅       │    │
│          │                   └──────────────────────┘    │
│          ▼                          │                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │                    DATA LAYER                      │  │
│  │   Neon (PostgreSQL)    │    Cloudflare R2          │  │
│  │   via Drizzle ORM      │    (generated media)      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │   Clerk (Auth)    │    Stripe (Billing)            │  │
│  │   Sentry (Errors) │    PostHog (Analytics)         │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Agent Loop Pipeline

The core generation engine follows a 6-step orchestration pattern:

```
┌──────┐   ┌──────────┐   ┌──────┐   ┌─────────┐   ┌──────────┐   ┌─────────┐
│ PLAN │──▶│ RETRIEVE │──▶│ROUTE │──▶│ EXECUTE │──▶│ ASSEMBLE │──▶│ PUBLISH │
└──────┘   └──────────┘   └──────┘   └─────────┘   └──────────┘   └─────────┘
   │           │              │           │              │               │
   ▼           ▼              ▼           ▼              ▼               ▼
 Business   pgvector        Model      Muapi.ai       Upload to       POST to
 Profile +  cosine          Router     (visual) +     R2 + save      YouTube/
 Content    similarity      selects    OpenAI         Asset Kit +    TikTok/
 Slot       top-k context   model      (text)         auto-embed     Instagram
```

### Plan
- Input: Business Profile + Content Slot (from calendar or manual request)
- Logic: GPT-4.1-mini determines content type, visual style, copy angle, and target platform
- Output: Generation plan (asset type, prompt skeleton, platform requirements)

### Retrieve (RAG)
- Input: Generation plan (query text)
- Logic: Embed the query via `text-embedding-3-small` → cosine similarity search on `brand_embeddings` table (filtered by userId) → return top-k (k=8) most relevant context chunks
- Sources searched: products, brand guidelines, past generations, user edits, industry knowledge
- Output: Structured prompt context containing only the most relevant brand data
- **Why RAG, not raw profile**: A user with 50 products and 200 past generations can't fit all of that into a prompt. Retrieval ensures only the relevant context is used.

### Route
- Input: Generation plan + retrieved context
- Logic: Model Router maps `{ assetType, quality, budget }` → `{ muapiModel, params, estimatedCost }`
- Config-driven routing table (not hard-coded):

| Asset Type | Fast/Cheap Model | Premium Model |
|-----------|-----------------|---------------|
| Product photo | `ai-product-shot` ($0.06) | `ai-product-photography` ($0.05) |
| Social graphic | `flux-schnell` ($0.03) | `seedream-v4` ($0.05) |
| Premium graphic | `hidream-i1-full` ($0.04) | `gpt4o-text-to-image` ($0.05) |
| Video (animate) | `kling-v2.1-standard-i2v` ($0.30) | `kling-v2.1-pro-i2v` ($0.40) |
| UGC lipsync | `creatify-lipsync` ($0.30) | `kling-v1-avatar-pro` ($0.30) |
| Background removal | `ai-background-remover` ($0.01) | — |
| Reframe | `ideogram-v3-reframe` ($0.05) | `luma-flash-reframe` ($0.10) |

### Execute
- Parallel calls: Muapi (visual) + OpenAI (text) — **with retrieved context injected into all prompts**
- Track cost from `X-MuAPI-Cost-USD` response header
- Retry with exponential backoff on 429/500

### Assemble
- Upload generated media to Cloudflare R2
- Create Asset Kit record: mediaUrl + caption + hashtags + metadata
- Save generation record with cost tracking
- **Auto-embed**: Embed the new generation's caption + prompt back into the Brand Knowledge Base (the system learns from every output)

### Publish (optional)
- If user has connected social accounts and requests publishing
- Call Muapi's social publishing API with the Asset Kit's media URL
- Async: returns request_id, poll for completion

---

## 3. Database Schema

```
┌─────────────────────┐     ┌──────────────────────┐
│       users          │     │  business_profiles    │
├─────────────────────┤     ├──────────────────────┤
│ id (cuid, PK)       │◄────│ userId (FK)           │
│ clerkId (unique)     │     │ businessName          │
│ email                │     │ businessType (enum)   │
│ name                 │     │ products (jsonb)      │
│ imageUrl             │     │ targetCustomers       │
│ createdAt            │     │ brandColors (jsonb)   │
│ updatedAt            │     │ brandTone (enum)      │
└─────────────────────┘     │ logoUrl               │
         │                   │ socialPlatforms (jsonb)│
         │                   └──────────────────────┘
         │
         ├──────────────────────────────┐
         │                              │
┌────────▼────────┐          ┌─────────▼──────────┐
│   asset_kits     │          │   generations       │
├─────────────────┤          ├────────────────────┤
│ id (PK)          │          │ id (PK)             │
│ userId (FK)      │          │ userId (FK)          │
│ mediaUrl         │◄─────── │ assetKitId (FK)      │
│ mediaType        │          │ model                │
│ caption          │          │ prompt               │
│ hashtags (jsonb) │          │ inputParams (jsonb)  │
│ platform         │          │ outputUrl            │
│ metadata (jsonb) │          │ costUsd (decimal)    │
│ createdAt        │          │ durationMs           │
└─────────────────┘          │ status               │
         │                    │ createdAt            │
         │                    └────────────────────┘
         │
┌────────▼──────────┐     ┌─────────────────────┐
│ calendar_entries   │     │  social_accounts     │
├───────────────────┤     ├─────────────────────┤
│ id (PK)            │     │ id (PK)              │
│ userId (FK)        │     │ userId (FK)           │
│ date               │     │ platform (1/2/3)     │
│ time               │     │ platformName         │
│ platform           │     │ accountName          │
│ contentType        │     │ muapiAccountId (int) │
│ assetKitId (FK)    │     │ connectedAt          │
│ status (enum)      │     └─────────────────────┘
│ createdAt          │
└───────────────────┘     ┌─────────────────────┐
                           │   publish_jobs       │
┌───────────────────┐     ├─────────────────────┤
│  subscriptions     │     │ id (PK)              │
├───────────────────┤     │ userId (FK)           │
│ id (PK)            │     │ assetKitId (FK)      │
│ userId (FK)        │     │ socialAccountId (FK) │
│ stripeCustomerId   │     │ platform             │
│ stripeSubId        │     │ muapiRequestId       │
│ planTier (enum)    │     │ status (enum)        │
│ status             │     │ resultUrl            │
│ periodStart        │     │ error                │
│ periodEnd          │     │ createdAt            │
│ createdAt          │     │ completedAt          │
└───────────────────┘     └─────────────────────┘

┌─────────────────────┐
│ generation_credits   │
├─────────────────────┤
│ id (PK)              │
│ userId (FK)          │
│ billingPeriodStart   │
│ creditsUsed (int)    │
│ creditsLimit (int)   │
│ updatedAt            │
└─────────────────────┘

┌───────────────────────────┐
│   brand_embeddings (RAG)   │
├───────────────────────────┤
│ id (PK)                    │
│ userId (FK)                │
│ contentType (enum)         │
│   product | brand_guide    │
│   | past_generation        │
│   | user_edit              │
│   | industry_knowledge     │
│ content (text)             │
│ embedding (vector(1536))   │
│ metadata (jsonb)           │
│ createdAt                  │
└───────────────────────────┘
  Requires: CREATE EXTENSION vector;

┌───────────────────────┐     ┌───────────────────────┐
│   pipeline_logs        │     │   generation_feedback  │
├───────────────────────┤     ├───────────────────────┤
│ id (PK)                │     │ id (PK)                │
│ generationId (FK)      │     │ assetKitId (FK)        │
│ stepName (string)      │     │ userId (FK)            │
│ modelUsed              │     │ rating (enum)          │
│ durationMs (int)       │     │   thumbs_up |          │
│ success (boolean)      │     │   thumbs_down          │
│ error (text, nullable) │     │ createdAt              │
│ costUsd (decimal)      │     └───────────────────────┘
│ createdAt              │
└───────────────────────┘
```

---

## 4. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/webhooks/clerk` | POST | Clerk user.created → insert user |
| `/api/business-profile` | GET/POST/PATCH | Business Profile CRUD |
| `/api/plan/propose` | POST | Agent proposes a content plan for the week |
| `/api/plan/[id]` | GET/PATCH | Get or update a content plan (edit items, reorder) |
| `/api/plan/[id]/approve` | POST | Approve plan → starts Generation Queue |
| `/api/plan/[id]/status` | GET | Poll generation progress (per-item status) |
| `/api/generate/image` | POST | Image generation (product photo, graphic) — called by Generation Queue |
| `/api/generate/text` | POST | Caption/hashtag/ad-copy generation — called by Generation Queue |
| `/api/generate/ugc` | POST | Full UGC video pipeline — called by Generation Queue |
| `/api/embeddings/embed` | POST | Embed new content into Brand Knowledge Base |
| `/api/embeddings/search` | POST | Semantic search against Brand Knowledge Base (used internally by Agent Loop) |
| `/api/social/connect` | POST | Get OAuth connect URL from Muapi |
| `/api/social/accounts` | GET/DELETE | List/disconnect connected accounts |
| `/api/social/publish` | POST | Publish Asset Kit to a platform |
| `/api/social/publish/[id]` | GET | Check publish job status |
| `/api/calendar` | GET/POST/PATCH | Calendar CRUD (entries auto-created when plan is approved) |
| `/api/feedback` | POST | Submit thumbs up/down rating for an Asset Kit |
| `/api/evals/insights` | GET | Performance insights for current user (acceptance rate, best content types) |
| `/api/evals/reliability` | GET | Pipeline reliability report (admin only) |
| `/api/billing/checkout` | POST | Create Stripe Checkout Session |
| `/api/billing/portal` | POST | Create Stripe Customer Portal session |
| `/api/webhooks/stripe` | POST | Stripe subscription events |

---

## 5. Social Publishing Flow

```
YOUR APP                           MUAPI.AI                    SOCIAL PLATFORM
────────                           ────────                    ───────────────
   │                                  │                             │
   │ POST /social/youtube/connect-url │                             │
   │  { external_user_id, redirect }  │                             │
   │─────────────────────────────────▶│                             │
   │                                  │                             │
   │  { url: "accounts.google.com/…" }│                             │
   │◀─────────────────────────────────│                             │
   │                                  │                             │
   │ redirect user to OAuth URL       │                             │
   │──────────────────────────────────────────────────────────────▶│
   │                                  │        user approves        │
   │◀──────────────────────────────────────────────────────────────│
   │                                  │                             │
   │ GET /social/ext/accounts         │                             │
   │  ?external_user_id=clerk_123     │                             │
   │─────────────────────────────────▶│                             │
   │                                  │                             │
   │  [{ id: 42, platform: "youtube" }]                             │
   │◀─────────────────────────────────│                             │
   │                                  │                             │
   │ POST /youtube-publish            │                             │
   │  { account_id: 42, media_url }   │                             │
   │─────────────────────────────────▶│  upload to YouTube          │
   │                                  │────────────────────────────▶│
   │  { request_id: "abc123" }        │                             │
   │◀─────────────────────────────────│                             │
   │                                  │                             │
   │ GET /predictions/abc123/result   │                             │
   │─────────────────────────────────▶│                             │
   │  { status: "completed",          │                             │
   │    output: { url: "youtube.com/…" } }                          │
   │◀─────────────────────────────────│                             │
```

---

## 6. UGC Video Pipeline

```
Step 1          Step 2          Step 3          Step 4          Step 5
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  SCRIPT  │──▶│ VOICEOVER│──▶│ LIP-SYNC │──▶│  B-ROLL  │──▶│ ASSEMBLE │
│          │   │          │   │  VIDEO   │   │          │   │ + REFRAME│
│ GPT-4.1  │   │ mmaudio  │   │ creatify │   │ kling    │   │ FFmpeg + │
│ ~$0.001  │   │ ~$0.10   │   │ ~$0.30   │   │ ~$0.30   │   │ luma     │
│          │   │          │   │          │   │          │   │ ~$0.20   │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
                                                              │
                                                    Total: ~$0.91/video
                                                              │
                                              ┌───────────────┼───────────────┐
                                              ▼               ▼               ▼
                                         9:16 TikTok    1:1 Instagram   16:9 YouTube
```

---

## 7. Deployment Topology

```
Replit (Next.js 15)
  ├── Clerk (auth, webhooks)
  ├── Neon (PostgreSQL + pgvector via Drizzle)
  ├── Cloudflare R2 (media storage)
  ├── Muapi.ai (visual AI + social publishing)
  ├── OpenAI (text AI + embeddings)
  ├── Stripe (billing, webhooks)
  ├── Google Analytics 4 (landing page traffic)
  ├── PostHog Cloud (product analytics, 1M events/mo free)
  └── Brevo (transactional email, lifecycle campaigns, newsletters)
```

All external services communicate via HTTPS REST APIs. No websockets, no gRPC. Muapi, Stripe, and Clerk use webhook callbacks for async events.

### Route Groups

```
src/app/
  ├── (public)/         ← Landing page, legal pages (no auth)
  ├── (auth)/           ← Sign-in, sign-up (Clerk components)
  ├── (dashboard)/      ← Authenticated user pages (sidebar layout)
  │   ├── dashboard/
  │   ├── plan/           (content plan proposal + UGC)
  │   ├── gallery/
  │   ├── calendar/
  │   ├── social/
  │   └── billing/
  └── (admin)/          ← Admin-only pages (role === 'admin' middleware)
      └── admin/
          ├── page.tsx          (overview dashboard)
          ├── users/            (CRM + user detail)
          ├── revenue/          (MRR, funnel, churn)
          └── costs/            (API costs, margin)
```

---

## 8. Security

| Concern | Solution |
|---------|----------|
| Authentication | Clerk handles sessions, CSRF, token refresh |
| API key protection | Muapi + OpenAI keys server-side only (no `NEXT_PUBLIC_`) |
| Media access | R2 signed URLs with expiration for generated assets |
| Webhook verification | Clerk: `svix` signature verification. Stripe: `stripe.webhooks.constructEvent` |
| Rate limiting | Per-user based on subscription tier (Generation Credits) |
| Input validation | Zod on all API inputs + form data |
| SQL injection | Drizzle ORM (parameterized queries, no raw SQL) |
| XSS | React's default escaping + CSP headers |
| Secrets | `.env.local` validated at startup, never committed |
