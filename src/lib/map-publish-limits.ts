/**
 * Single source of truth for the published-map size cap, shared by the
 * client-side editor validator (`src/components/game/editor/map-validate.ts`,
 * checked before publish so the author gets an actionable warning) and the
 * server's actual enforcement (`src/lib/game-map-core.ts`, the real limit —
 * Mongo document size plus request body headroom). These two used to be two
 * separately hand-maintained numbers measuring two different things (the
 * client only summed embedded data: URL bytes; the server checks the full
 * serialized document), so a map could pass client validation and still get
 * rejected on publish with a less actionable error.
 */
export const MAP_PUBLISH_MAX_BYTES = 4_500_000;
