/**
 * DEV-28 (STU-24): UGC voiceover generation — the second step of the Phase 3
 * UGC Video Pipeline (Script → **Voiceover** → Lip-sync → B-roll → Assembly →
 * Reframe). Given the spoken text produced by the script step (DEV-27's
 * `UgcScript.spokenText`), it generates a natural-speech audio track via Muapi's
 * `gemini-3-1-flash-tts` model (routed through the Model Router, DEV-18).
 *
 * The audio URL feeds the lip-sync step (DEV-29), which drives a presenter
 * portrait from this voiceover.
 *
 * ⚠️ Model history: the plan (plan-phase-3.md) originally specified
 * `elevenlabs-text-to-dialogue-v3`, but on 2026-07-23/24 that model FAILED
 * generation 7/7 ("internal error, please try again later") despite being
 * catalog-live. A Text-to-Audio catalog re-audit found `gemini-3-1-flash-tts`
 * completes reliably to a real MP3 at ~$0.003 (vs ElevenLabs' non-working $0.10)
 * — human-approved swap. See `.agents/memory/muapi-api-contract.md`.
 *
 * Model contract (verified live against `GET /api/v1/models/...`, 2026-07-24):
 *   POST body → `{ speakers: [{ speaker_id, voice_name, accent, style, pace }],
 *   dialogue_turns: [{ speaker_id, text }], scene?, sample_context?, temperature? }`.
 *   `speaker_id` must be `"Speaker N"`. `voice_name`/`accent`/`style`/`pace` are
 *   enums (see the exported catalogs). This service generates a single-speaker
 *   read (one speaker, one turn) — the UGC format is one presenter talking.
 *
 * Testability mirrors the sibling services (`social-graphic.ts`, `ugc-script.ts`):
 * the Muapi call and the router are injectable, so param assembly, voice
 * resolution, routing, and cost/result mapping unit-test with fakes. The default
 * Muapi call lazily loads the DEV-15 service (which logs each call), so the
 * module loads under the bare Node test runner.
 *
 * Scope: voiceover only. Lip-sync, B-roll, assembly, reframe, persistence, and
 * UI are later Phase-3 slices (DEV-29…DEV-33).
 */
import { modelRouter, ModelRouter } from "./model-router.ts";
import type { MuapiGenerateParams, MuapiGenerateResult } from "@/lib/muapi";

/** Pipeline-log step label for the voiceover call. */
const VOICEOVER_STEP = "execute:ugc_voiceover";
/** Gemini caps a dialogue turn's text at 10000 characters. */
export const MAX_DIALOGUE_CHARS = 10_000;
/** Single-speaker UGC read — the presenter talking to camera. */
const SPEAKER_ID = "Speaker 1";

/**
 * The prebuilt Gemini voices Muapi accepts for `gemini-3-1-flash-tts`, from the
 * model's live `input_schema` enum (`GET /api/v1/models/...`, 2026-07-24).
 */
export const VOICEOVER_VOICES = [
  "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe",
  "Callirrhoe", "Charon", "Despina", "Enceladus", "Erinome", "Fenrir", "Gacrux",
  "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Puck", "Pulcherrima",
  "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel",
  "Vindemiatrix", "Zephyr", "Zubenelgenubi",
] as const;
export type VoiceName = (typeof VOICEOVER_VOICES)[number];

/** Emotional delivery styles (schema enum). */
export const VOICE_STYLES = [
  "Vocal Smile", "Newscaster", "Whisper", "Empathetic", "Promo/Hype", "Deadpan",
] as const;
export type VoiceStyle = (typeof VOICE_STYLES)[number];

/** Speaking accents (schema enum). */
export const VOICE_ACCENTS = [
  "Neutral", "American (Gen)", "American (Valley)", "American (South)",
  "British (RP)", "British (Brixton)", "Transatlantic", "Australian",
] as const;
export type VoiceAccent = (typeof VOICE_ACCENTS)[number];

/** Speaking pace (schema enum). */
export const VOICE_PACES = ["Natural", "Rapid Fire", "The Drift", "Staccato"] as const;
export type VoicePace = (typeof VOICE_PACES)[number];

/**
 * Defaults tuned for authentic first-person UGC reviews: a warm voice, a
 * conversational "Vocal Smile" delivery, a general American accent, and a
 * natural pace. The agent may override per request/audience.
 */
export const DEFAULT_VOICE_NAME: VoiceName = "Kore";
export const DEFAULT_STYLE: VoiceStyle = "Vocal Smile";
export const DEFAULT_ACCENT: VoiceAccent = "American (Gen)";
export const DEFAULT_PACE: VoicePace = "Natural";

const VOICE_SET = new Set<string>(VOICEOVER_VOICES);
const STYLE_SET = new Set<string>(VOICE_STYLES);
const ACCENT_SET = new Set<string>(VOICE_ACCENTS);
const PACE_SET = new Set<string>(VOICE_PACES);

export interface UgcVoiceoverRequest {
  /** The script's spoken text (DEV-27 `UgcScript.spokenText`). */
  text: string;
  /** Gemini voice name (default {@link DEFAULT_VOICE_NAME}). */
  voiceName?: string;
  /** Emotional delivery style (default {@link DEFAULT_STYLE}). */
  style?: string;
  /** Speaking accent (default {@link DEFAULT_ACCENT}). */
  accent?: string;
  /** Speaking pace (default {@link DEFAULT_PACE}). */
  pace?: string;
  /** Sampling temperature (model default 1). Omit to use the model default. */
  temperature?: number;
}

export interface UgcVoiceoverResult {
  /** URL of the generated audio track (feeds the lip-sync step). */
  audioUrl: string;
  /** The voice actually used. */
  voiceName: string;
  /** Muapi cost in USD (COGS, hidden from the user). */
  cost: number;
  model: string;
}

/** The Muapi generation call. Injectable (shared shape with the siblings). */
export type MuapiGenerate = (
  model: string,
  params: MuapiGenerateParams,
  options?: { step?: string },
) => Promise<MuapiGenerateResult>;

/** Resolve+validate an enum value: default when absent, fail-loud on unknown. */
function resolveEnum(
  value: string | undefined,
  set: Set<string>,
  fallback: string,
  label: string,
): string {
  if (value === undefined) {
    return fallback;
  }
  if (!set.has(value)) {
    throw new Error(`Unsupported voiceover ${label}: ${value}`);
  }
  return value;
}

/** Resolve the voice name (default, or a supported name; throws on unknown). */
export function resolveVoiceName(voiceName?: string): string {
  return resolveEnum(voiceName, VOICE_SET, DEFAULT_VOICE_NAME, "voice_name");
}

/**
 * Build the Muapi request body for a single-speaker voiceover: one speaker with
 * the resolved voice/style/accent/pace, delivering the whole script as one turn.
 * `temperature` is included only when supplied. Throws on empty/over-long text
 * or an unsupported style/accent/pace.
 */
export function buildVoiceoverParams(
  text: string,
  options: {
    voiceName?: string;
    style?: string;
    accent?: string;
    pace?: string;
    temperature?: number;
  } = {},
): MuapiGenerateParams {
  const spoken = text.trim();
  if (!spoken) {
    throw new Error("Voiceover text is empty");
  }
  if (spoken.length > MAX_DIALOGUE_CHARS) {
    throw new Error(
      `Voiceover text is ${spoken.length} chars; the limit is ${MAX_DIALOGUE_CHARS}`,
    );
  }
  const params: MuapiGenerateParams = {
    speakers: [
      {
        speaker_id: SPEAKER_ID,
        voice_name: resolveVoiceName(options.voiceName),
        accent: resolveEnum(options.accent, ACCENT_SET, DEFAULT_ACCENT, "accent"),
        style: resolveEnum(options.style, STYLE_SET, DEFAULT_STYLE, "style"),
        pace: resolveEnum(options.pace, PACE_SET, DEFAULT_PACE, "pace"),
      },
    ],
    dialogue_turns: [{ speaker_id: SPEAKER_ID, text: spoken }],
  };
  if (options.temperature !== undefined) {
    params.temperature = options.temperature;
  }
  return params;
}

export interface UgcVoiceoverConfig {
  muapi?: MuapiGenerate;
  router?: ModelRouter;
}

export class UgcVoiceoverService {
  private readonly muapi: MuapiGenerate;
  private readonly router: ModelRouter;

  constructor(config: UgcVoiceoverConfig = {}) {
    this.muapi = config.muapi ?? defaultMuapi;
    this.router = config.router ?? modelRouter;
  }

  /**
   * Generate a voiceover audio track for `request.text`. Throws on an
   * unsupported voice/style/accent/pace, invalid text, or Muapi failure (the
   * caller decides whether that's fatal / retryable). The Muapi service logs it.
   */
  async generateVoiceover(
    request: UgcVoiceoverRequest,
  ): Promise<UgcVoiceoverResult> {
    const voiceName = resolveVoiceName(request.voiceName);
    const params = buildVoiceoverParams(request.text, {
      voiceName,
      style: request.style,
      accent: request.accent,
      pace: request.pace,
      temperature: request.temperature,
    });
    const model = this.router.getModel("voiceover");

    const generated = await this.muapi(model, params, { step: VOICEOVER_STEP });

    return {
      audioUrl: generated.imageUrl, // outputs[0] — the audio track URL
      voiceName,
      cost: generated.cost,
      model,
    };
  }
}

/** Default Muapi call — the DEV-15 service (which logs each call). */
const defaultMuapi: MuapiGenerate = async (model, params, options) => {
  const { muapiService } = await import("@/lib/muapi");
  return muapiService.generate(model, params, options);
};

export const ugcVoiceoverService = new UgcVoiceoverService();
