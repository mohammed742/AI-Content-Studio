/**
 * DEV-19/21: TEMPORARY free-tier model shim.
 *
 * This account's free/sandbox Muapi tier only serves `nano-banana-2`; the
 * Model Router's intended slugs (`ai-product-shot`, `flux-schnell`,
 * `ai-background-remover`, `ideogram-v3-reframe`, `seedream-v4`, …) 404 (see
 * DEV-8). `resolveAvailableModel` maps any un-served model to nano-banana-2 so
 * the generation pipelines run end to end.
 *
 * Shared by every generation pipeline so the workaround lives in exactly one
 * place. TODO(muapi-key): delete this module and its call sites once the key
 * is upgraded — the Model Router's intended models should then flow through
 * untouched.
 */
const FREE_TIER_MODEL = "nano-banana-2";
const AVAILABLE_ON_FREE_TIER = new Set<string>([FREE_TIER_MODEL]);

export function resolveAvailableModel(model: string): string {
  return AVAILABLE_ON_FREE_TIER.has(model) ? model : FREE_TIER_MODEL;
}
