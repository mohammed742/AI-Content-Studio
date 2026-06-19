# AI Content Studio — Design System & UI/UX Specification

> Every UI decision in this project flows from this file. Read it before writing any component. Rules are contextual — pull only what fits the current page.

---

## 0. Design Read

**Product:** AI Content Studio — B2B SaaS for SMBs  
**Audience:** Small business owners (restaurants, salons, e-commerce, gyms, real estate) who are NOT designers. They need results fast, not creative tools.  
**Vibe:** Professional but approachable. Modern but not intimidating. Premium but not luxury.  
**Aesthetic family:** Modern SaaS dashboard — clean structure with creative energy. Think Linear's precision meets Canva's approachability.

---

## 1. The Three Dials

Every layout, motion, and density decision below is gated by these values.

| Dial | Value | Meaning |
|------|-------|---------|
| `DESIGN_VARIANCE` | **6** | Modern but professional. Asymmetric layouts where appropriate. Not wild or experimental. |
| `MOTION_INTENSITY` | **5** | Subtle micro-animations: hover lifts, smooth transitions, skeleton shimmer. Not cinematic scroll-jacking. |
| `VISUAL_DENSITY` | **5** | SaaS density: more information per viewport than a portfolio, less than a financial dashboard. |

### How dials drive output

- **VARIANCE 6** → Use split-screen heroes, asymmetric card grids, varied section layouts. But keep clear visual hierarchy. No chaotic layouts.
- **MOTION 5** → Animate: page transitions (fade), card hovers (lift + shadow), skeleton loaders, toast enter/exit, generation progress. Don't animate: background meshes, floating particles, parallax scroll, magnetic cursors.
- **DENSITY 5** → Dashboard shows stats + quick actions + recent items in one view. But generous padding between sections. No cramped tables without breathing room.

---

## 2. Foundation Stack

| Layer | Choice | Import |
|-------|--------|--------|
| **Components** | shadcn/ui (Radix-based, copy-paste ownership) | `npx shadcn@latest add [component]` |
| **Icons** | `@phosphor-icons/react` | `import { Icon } from "@phosphor-icons/react"` |
| **Font** | Geist + Geist Mono | `next/font/local` (NEVER `<link>` to Google Fonts) |
| **Animation** | motion/react | `import { motion } from "motion/react"` |
| **Forms** | React Hook Form + Zod | `useForm()` + `zodResolver()` |
| **Toasts** | Sonner | `import { toast } from "sonner"` |
| **Tables** | TanStack Table | For gallery, admin CRM, publish history |
| **Charts** | Recharts | Admin analytics only |
| **Calendar** | FullCalendar or custom with date-fns | Content calendar page |
| **Video** | react-player | UGC preview, gallery video playback |

### Rules

- **One icon family per project.** Do not mix Phosphor with Lucide. `lucide-react` is acceptable ONLY if already installed and widely used — never as first choice.
- **Standardize `strokeWidth` globally** at `1.5`.
- **One font family.** Geist for display + body, Geist Mono for stats/costs/code. No second font.
- **RSC safety:** Any component using `motion`, scroll listeners, or pointer physics MUST be a Client Component (`'use client'`). Server Components render static layouts only.
- **Dependency check:** Before importing ANY library, check `package.json`. If missing, output the install command first.

---

## 3. Color System

### Palette

| Role | Value | Usage |
|------|-------|-------|
| **Neutral base** | Zinc (`zinc-50` → `zinc-950`) | Backgrounds, text, borders. NOT slate, NOT gray. |
| **Accent** | Emerald (`emerald-500` primary, `emerald-400` hover) | CTAs, active states, success indicators, links |
| **Error** | Red (`red-500`) | Error messages, destructive actions |
| **Warning** | Amber (`amber-500`) | Credit warnings, approaching limits |
| **Success** | Green (`green-500`) | Publish success, generation complete |
| **Info** | Blue (`blue-500`) | Informational toasts, tips |

### Rules

- **THE LILA RULE:** No AI-purple gradients. No random neon glows. No generic blue-to-purple hero backgrounds. The accent is Emerald, period.
- **COLOR CONSISTENCY LOCK:** Once Emerald is the accent, it's used on the WHOLE page. A Zinc+Emerald dashboard does not suddenly get an orange CTA in the billing section.
- **One palette per project.** Do not fluctuate between warm and cool grays. Zinc throughout.
- **Dark mode by default.** Light mode toggle available. Dark: `zinc-950` background, `zinc-50` text. Light: `white` background, `zinc-900` text.

---

## 4. Typography

### Scale

| Role | Classes | Example |
|------|---------|---------|
| **Page title** | `text-3xl font-semibold tracking-tight` | "Dashboard", "Gallery" |
| **Section heading** | `text-xl font-medium` | "Recent Generations", "Connected Accounts" |
| **Card title** | `text-base font-medium` | Asset name, user name |
| **Body** | `text-sm text-zinc-400 leading-relaxed` | Descriptions, help text |
| **Caption** | `text-xs text-zinc-500` | Timestamps, metadata |
| **Stat number** | `text-2xl font-mono font-semibold` | "2,847", "$49.00" |
| **Landing hero** | `text-4xl md:text-6xl font-bold tracking-tighter leading-none` | Main headline |

### Rules

- **FONT BAN:** Inter is DISCOURAGED as the default. Geist is the project font.
- **SERIF DISCIPLINE:** Serifs are VERY DISCOURAGED. This is a SaaS dashboard, not a magazine. Sans-serif display only.
- **Body max width:** `max-w-[65ch]` for any paragraph text.
- **No placeholder-as-label.** Ever. Label ABOVE input, always.
- **Emoji policy:** Discouraged in UI text. Use Phosphor icons instead. Exception: toast messages may use a single leading emoji for quick scanning.

---

## 5. Layout Rules

### Dashboard Layout (all `/dashboard/*` pages)

```
┌──────────────────────────────────────────────┐
│ Sidebar (280px / 64px collapsed)  │  Main    │
│ ┌──────────┐                      │  Content │
│ │ Logo     │                      │          │
│ │ ──────── │                      │          │
│ │ Dashboard│                      │          │
│ │ Plan     │                      │          │
│ │ Gallery  │                      │          │
│ │ Calendar │                      │          │
│ │ Social   │                      │          │
│ │ Billing  │                      │          │
│ │ ──────── │                      │          │
│ │ Profile  │                      │          │
│ └──────────┘                      │          │
└──────────────────────────────────────────────┘
```

- Sidebar: fixed left, 280px expanded / 64px icon-only collapsed. Toggle via hamburger.
- Main content: `max-w-7xl mx-auto px-6 py-8`
- Mobile (< 768px): sidebar becomes bottom tab bar (5 items: Dashboard, Plan, Gallery, Calendar, More)

### Landing Page Layout (public pages)

- Full-width sections. No sidebar. No dashboard chrome.
- Container: `max-w-7xl mx-auto px-6`
- Sticky nav bar at top (64px height max)

### Global Rules

- **Viewport stability:** NEVER use `h-screen`. ALWAYS use `min-h-[100dvh]`.
- **Grid over flex-math:** NEVER use `w-[calc(33%-1rem)]`. ALWAYS use CSS Grid.
- **Mobile collapse explicit:** Every multi-column layout must declare its `< 768px` fallback in the same component.
- **Breakpoints:** `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`
- **Spacing:** 8px grid system (8, 12, 16, 24, 32, 48)

---

## 6. Anti-Default Directives

These override common AI coding defaults. Each rule has a context-aware override path.

### 6.1 Anti-Center Bias
Centered hero sections are avoided when `DESIGN_VARIANCE > 4`. Use split-screen (50/50), left-aligned content, or asymmetric layouts.  
**Override:** Centered hero is OK for a single launch-announcement or manifesto page.

### 6.2 The Lila Rule
No AI-purple gradients. No random neon. Zinc + Emerald only. See §3.

### 6.3 Card Discipline
Use cards ONLY when elevation communicates real hierarchy. Otherwise group with `border-t`, `divide-y`, or negative space. Tint shadows to the background hue. No pure-black drop shadows on light backgrounds.

### 6.4 Shape Consistency Lock
Pick ONE corner-radius scale and stick to it:
- **Cards/panels:** `rounded-xl` (12px)
- **Inputs/selectors:** `rounded-lg` (8px)
- **Buttons:** `rounded-full` (pill) for primary CTAs, `rounded-lg` for secondary
- **Avatars:** `rounded-full`

No mixing. Round buttons in a square-card layout is broken design.

### 6.5 Eyebrow Restraint
An "eyebrow" is the small uppercase label above a section headline. Maximum **1 eyebrow per 3 sections**. Not on every section. Most sections don't need one — the headline alone is enough.

### 6.6 Section-Layout-Repetition Ban
Once you use a layout family (3-column cards, split text+image, full-width quote), it can appear at most ONCE on a page. A landing page with 8 sections must use at least 4 different layout families.

### 6.7 Zigzag Alternation Cap
Max 2 consecutive left-right alternating sections. The 3rd must break the pattern.

### 6.8 Form Labels
Label ABOVE input. Helper text below. Error text below helper in red. Standard `gap-2` for input blocks.

### 6.9 Emoji Policy
Discouraged in UI. Use Phosphor icon glyphs instead. Override only when brief explicitly calls for playful/chat-style tone.

### 6.10 No Fake Screenshots
No div-based "fake product previews". Use real generated images (we literally build an image generation tool). If no images exist yet, leave clearly-labeled placeholder slots.

---

## 7. Interactive UI States (MANDATORY)

Every component must implement all applicable states:

| State | Implementation |
|-------|---------------|
| **Loading** | Skeleton loaders matching final layout shape. No generic circular spinners. Shimmer animation via `motion/react`. |
| **Empty** | Beautifully composed illustration-free message + CTA. E.g., "No generations yet. Create your first content →" |
| **Error** | Inline for forms (red text below field). Contextual toasts (Sonner) for transient errors. Full-page error boundary for crashes. |
| **Tactile feedback** | On `:active`, use `-translate-y-[1px]` or `scale-[0.98]` for button press feel. |
| **Hover** | Cards: `translate-y-[-2px]` + increased shadow. Buttons: background shift. Links: underline on hover only. |
| **Disabled** | `opacity-50 cursor-not-allowed`. Never remove the element — show it disabled with tooltip explaining why. |

### Button Contrast Check (MANDATORY)
Before shipping any button, verify text is readable against background. WCAG AA minimum: 4.5:1 for body text, 3:1 for large text (18px+). White text on light background = banned.

---

## 8. Image Strategy

Priority order for visual assets:

1. **AI-generated images** — We build an image generation tool. Use it. Product photos, lifestyle scenes, social graphics should all be real generated output.
2. **Real stock photography** — When AI-generated images aren't available yet (early phases), use `picsum.photos` with descriptive seeds.
3. **NEVER:** Hand-rolled SVG illustrations, div-based fake screenshots, gradient blob placeholders. These are tells that the product is half-built.

---

## 9. Page-by-Page Specifications

### 9.1 Landing Page (`/`)

**Layout:** Full-width, no sidebar, sticky nav (64px).

| Section | Layout | Content |
|---------|--------|---------|
| **Hero** | Split-screen: left text, right product demo | Headline (max 2 lines), subtext (max 20 words), primary CTA "Start Free" + secondary "See Demo" |
| **Pain Points** | 3-column icon + text cards | "Agencies: $2K-10K/mo", "Social managers: $1.5-5K/mo", "Our solution: from $19/mo" |
| **Features** | Alternating left/right sections (max 2 zigzags) | Product Photos, Social Graphics, UGC Videos, Auto Calendar — each with generated screenshot |
| **UGC Demo** | Full-width video embed | Auto-playing muted preview of a generated UGC ad with play button overlay |
| **Social Proof** | Logo wall + stat counter | Platform icons (YouTube, TikTok, Instagram) + "X businesses served" |
| **Pricing** | 3 plan cards side by side | Starter / Pro / Business with feature checkmarks and CTAs |
| **FAQ** | Accordion (shadcn) | 6-8 questions, single-open behavior |
| **Final CTA** | Full-width dark section | "Ready to transform your social media?" + CTA button |

**SEO:** `<title>` tag, `<meta description>`, OG image (1200x630), Twitter card, JSON-LD SaaS schema.  
**Legal:** Privacy Policy + Terms of Service links in footer.  
**Analytics:** GA4 `page_view` auto, `cta_click` on every button.

### 9.2 Auth (`/sign-in`, `/sign-up`)

- Clerk-hosted components styled to match Zinc+Emerald brand
- Centered card on subtle gradient background
- Social login (Google) above email form
- Redirect: new users → `/onboarding`, returning → `/dashboard`

### 9.3 Onboarding (`/onboarding`)

**Layout:** Full-screen, no sidebar. Progress dots (not numbers) at top.

| Step | Content | UX Notes |
|------|---------|----------|
| 1. Business Info | Name input, type selector as card grid (not dropdown) | Cards with icons: Restaurant, E-commerce, Salon, Gym, etc. |
| 2. Products | Add products: name + description, inline add button | Start with 1 empty row, "Add another" below |
| 3. Customers | Text area + AI-suggested customer persona pills | Click to accept a suggestion, or type custom |
| 4. Brand Identity | Logo upload → auto color extraction, tone selector (pill buttons: Professional, Casual, Playful, Luxury) | Color swatches show extracted colors, editable |
| 5. Platforms | Platform cards with toggles: YouTube, TikTok, Instagram | Show which formats each platform needs |

- Back button preserves all data
- Skip button on each step (with warning: "Skipping reduces generation quality")
- Final review screen before submit
- PostHog: `onboarding_step_completed`, `onboarding_completed` events

### 9.4 Dashboard (`/dashboard`)

**Layout:** Sidebar + main content.

| Component | Content |
|-----------|---------|
| **Welcome** | "Good morning, {name}" or "Welcome back, {name}" |
| **Primary CTA** | Large card: "Generate This Week's Content" → takes user to Content Plan page. Phosphor SparkleIcon. This is the #1 action on the page. |
| **Content Status** | If a content plan exists: progress card showing "3 of 7 items generated" with a progress bar + "Continue" CTA. |
| **Stats Row** | 3 stat cards: Content created this month (number), Credits left ("15 of 50 remaining" — bar, no dollar amounts), Connected platforms (count + icons) |
| **Recent** | Horizontal scroll card row (last 5 generated items). Card = thumbnail + type badge + platform icon + date. Click → Gallery detail. |
| **Quick Actions** | Secondary row: View Calendar, Browse Gallery, Connect Platforms |

**Empty state (new user):** "Welcome! Complete your business profile and we'll create your first content plan →" with arrow to onboarding.  
**Loading:** Skeleton matching exact layout above.

### 9.5 Content Plan (`/plan`)

> **This is NOT a prompt-based generation tool.** Users don't write prompts, pick models, or make creative decisions. The agent analyzes their business profile and proposes a complete content plan. The user just reviews and approves.

**Layout:** Single column, max-w-4xl centered.

**Flow (3 states):**

**State 1 — No plan yet:**
- Hero message: "Let's plan your content for the week"
- Subtext: "We'll analyze your business and create a personalized content plan — photos, graphics, videos, and captions, all ready to go."
- Single CTA: "Create My Content Plan" (emerald, large)
- Below: "You have 15 of 50 credits left this month" (usage bar)
- Clicking triggers: agent analyzes business profile + calendar gaps + industry best practices → generates a proposed plan
- Loading state: "Analyzing your business..." → "Planning content types..." → "Selecting best formats..." → "Building your plan..."

**State 2 — Plan proposed (review mode):**
- Header: "Your Content Plan for This Week" with date range
- Subtext: "Review the plan below. Edit, remove, or add items, then approve to start generating."
- Plan items as cards in a vertical list. Each card shows:
  - Content type icon (Phosphor: Camera for photo, Image for graphic, VideoCamera for video)
  - Title: "Product showcase — [product name]" or "Behind-the-scenes — your kitchen" or "Customer tip — styling advice"
  - Platform badge(s): Instagram, TikTok, YouTube
  - Brief description of what will be generated (1-2 sentences, written by agent)
  - Scheduled day: "Monday" / "Wednesday" / etc.
  - Actions: Edit (pencil icon → inline edit description), Remove (trash icon), Reorder (drag handle)
- "+ Add another item" button at bottom → opens a simple form: "Describe what you'd like" (free text, agent handles the rest)
- Footer bar (sticky): "7 items · Will use 12 credits · You have 15 left" + "Approve & Generate All" CTA (emerald)
- No model names. No cost per item. No technical settings. Just content descriptions.

**State 3 — Generating (progress mode):**
- Same card list but each card now shows generation progress:
  - Pending: dimmed, "Waiting..."
  - In progress: shimmer animation, "Creating your [content type]..."
  - Done: thumbnail preview appears, green checkmark, "View" link
  - Failed: red badge, "Retry" button
- Top progress bar: "4 of 7 items complete"
- Items generate in parallel where possible (images can parallel, video is sequential)
- When all done: "Your content is ready! Review it in your Gallery →" CTA

**Mobile:** Same single-column layout, cards stack naturally.

### 9.6 UGC Video (`/plan/ugc`)

> Same agent-driven philosophy. User doesn't write scripts or pick avatars unprompted — the agent proposes everything.

**Layout:** Single-column wizard.

| Step | What the user sees | What the agent does |
|------|--------------------|--------------------|
| **1. Script Review** | Pre-written 15-second script in an editable card. "Here's what your customer would say about [product]." Edit button for tweaks. Regenerate button for a new take. | Agent wrote the script based on business profile, product details, and brand tone. |
| **2. Presenter** | Grid of presenter options (photos). Agent pre-selects the best match for the brand. User can change selection. | Agent picks based on brand audience (age, style). |
| **3. Confirm** | Summary card: script preview, presenter photo, platforms (auto-selected from connected accounts), "This will use 3 credits. You have 15 left." Big CTA: "Generate Video" | Everything is pre-filled. User just confirms. |
| **4. Progress** | Step-by-step with friendly labels: "Writing the voiceover..." → "Creating the video..." → "Adding product shots..." → "Formatting for your platforms..." | No model names, no technical jargon. |
| **5. Result** | Video player with platform format tabs (TikTok / Instagram / YouTube). Download per format. "Add to Calendar" and "Publish Now" CTAs. | Agent already formatted for each connected platform. |

### 9.7 Gallery (`/gallery`)

**Layout:** Grid — 3 columns desktop, 2 tablet, 1 mobile.

- **Filter bar:** Type (All, Photo, Graphic, Video), Platform, Date range
- **Sort:** Newest first (default), Oldest
- **Cards:** Thumbnail + hover overlay (type badge top-left, platform icon top-right, date bottom). **Thumbs up/down icons on hover** — one tap to rate, filled state shows current rating.
- **Click:** Expand to lightbox — full image/video, editable caption, hashtag pills, platform badges, created date. **Thumbs up/down buttons (prominent)** with label: "Did this match your brand?" Action buttons: Download, Publish, Regenerate ("Create a new version"), Delete
- **Multi-select:** Toggle mode for batch download/delete
- **Pagination:** 12 per page, load more button (not infinite scroll)
- **No technical details visible:** No model names, no cost per item, no prompt text. Users see content, not infrastructure.
- **Feedback drives future plans:** Rating data feeds into the Performance Feedback Loop — the agent learns what works and proposes more of it.

**Empty state:** "No content yet. Create your first content plan →" (links to `/plan`)

### 9.8 Calendar (`/calendar`)

**Layout:** Month view (default) with week view toggle.

- **Day cells:** Dot indicators color-coded by content type (emerald = photo, blue = graphic, purple = video)
- **Click day:** Slide-over panel with scheduled items. Each shows thumbnail (if generated), type, platform. If not yet generated: "Planned" badge + content description from the plan.
- **Drag-and-drop:** Reschedule by dragging items between days
- **"Plan This Week" CTA:** Prominent button → navigates to `/plan` to create a new content plan for the selected week. This is the primary way users trigger content creation.
- **"Plan Next Week" CTA:** Secondary button for planning ahead
- **Legend:** Color-coded key at top

**Empty state:** "No content planned yet. Let's create your first content plan →" (links to `/plan`)  
**Mobile:** Month view → scrollable list view grouped by day.

### 9.9 Social Accounts (`/social`)

**Connected Accounts section:**
- Platform cards (YouTube, TikTok, Instagram) with connect/disconnect
- Connected: platform icon + account name + green "Connected" badge + disconnect link
- Disconnected: platform icon + "Connect {Platform}" CTA (triggers Muapi OAuth flow)

**Publishing History section:**
- Table: date, asset thumbnail, platform, status badge (Pending/Published/Failed)
- Click row → expand details (publish URL, error message if failed, retry button)

**Publish flow (triggered from Gallery/Calendar):**
Select asset → select platform → fill platform-specific fields (title, description, tags for YouTube; caption for TikTok/Instagram) → confirm → polling for result → toast on completion

### 9.10 Billing (`/billing`)

- **Current plan card (prominent):** Plan name, price/mo, usage bar (emerald fill, credits used/limit), renewal date, "Manage Subscription" link
- **Plan comparison:** 3 cards side by side — Starter ($19), Pro ($49), Business ($99). Feature checkmarks. Current plan highlighted. Upgrade CTA on other plans.
- **Billing history:** Table of past invoices — date, amount, status, download PDF link
- **Manage subscription:** Deep link to Stripe Customer Portal

**Free user empty state:** Prominent upgrade card: "Unlock unlimited generations, UGC videos, and direct publishing →"

### 9.11 Admin (`/admin`)

**Separate route group.** `role === 'admin'` middleware check. Non-admins redirected to `/dashboard`.

**Admin sidebar nav:** Overview, Users, Revenue, Costs (separate from main dashboard sidebar).

| Page | Content |
|------|---------|
| **Overview** | Stat cards (total users, free/paid split, MRR, total API costs, active this week). Recharts area chart: signups over time (30 days). |
| **Users** | TanStack Table: name, email, plan tier, generations count, total cost, last active, joined. Search, filter by plan, sort. Click → slide-over detail. |
| **User Detail** | Slide-over: full profile, business profile summary, generation history (thumbnails), cost breakdown (monthly bar chart), subscription history, connected socials, PostHog session link. Admin actions: upgrade, add credits, suspend, trigger email. |
| **Revenue** | MRR line chart, conversion funnel (Free → Starter → Pro → Business), churn rate (monthly %), LTV, ARPU. |
| **Costs** | Muapi vs OpenAI costs stacked area chart, revenue vs costs margin chart, cost per generation average, top 10 expensive users, cost alerts (users where COGS > plan revenue). |

---

## 10. Responsive Behavior Summary

| Page | Desktop | Mobile (< 768px) |
|------|---------|-------------------|
| Landing | Full-width sections | Sections stack, hero → single column |
| Dashboard | Sidebar + content | Bottom tab bar + content |
| Content Plan | Single column centered | Same, full-width cards |
| UGC | Single column wizard | Same, full-width steps |
| Gallery | 3-column grid | 1-column list |
| Calendar | Month view | List view by day |
| Social | Side-by-side cards | Stacked cards |
| Billing | 3 plan cards row | Stacked cards |
| Admin | Sidebar + content | Hamburger nav + content |
