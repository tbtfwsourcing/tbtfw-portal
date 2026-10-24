// TBTFW — SPEC INFERENCE — Edge Function v2.7 (Oct 15, 2026)
// CHANGE FROM v2.6 (one change class — PORTAL LEAD MODE):
//   A POST body of {"lead_id": "<uuid>"} grades ONE portal sell lead from
//   public.leads instead of the pending-listings batch. The lead is mapped to
//   the listing shape (title synthesized from year/make/model/trim; excerpt
//   composed from the seller's own words: message, mods, condition, title
//   status, owner count, records, intent; model/trim = canon_model/canon_trim
//   when set) and runs through the IDENTICAL per-car code path — same
//   vocabulary, same model_intel injection, same prompt, same validation —
//   then PATCHes leads (detected_specs, unmatched_tokens, desirability_tier,
//   desirability_why) instead of listings. One grader, two row sources; the
//   prompt text is byte-identical to v2.6. No body / empty body = v2.6
//   behavior exactly. detected_specs_at is not stamped on leads (the lead's
//   enrichment clock is enriched_at, owned by lead-enrich).
// FROM v2.6 (July 10): zero-vocab makes still graded (empty vocabulary block).
// FROM v2.5 (July 9): D1 model_intel injection.
// FROM v2.4: BATCH_SIZE 12 (546 WORKER_RESOURCE_LIMIT fix, July 9).
// FROM v2.3: G's July 6 desirability tier boundaries.
// FROM v2.2: identity floor, collector-call doctrine.

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "platform env missing" }, 500);
  if (!ANTHROPIC_KEY) return json({ ok: false, error: "ANTHROPIC_KEY secret missing" }, 500);

  const SB_BASE = `${SUPABASE_URL}/rest/v1`;
  const SB_HEADERS: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  const BATCH_SIZE = 12;
  const EXCERPT_MAX_CHARS = 2000;

  // ---- v2.7: lead mode selection (read the body before anything else) ----
  let leadId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.lead_id === "string" && /^[0-9a-fA-F-]{36}$/.test(body.lead_id.trim())) {
      leadId = body.lead_id.trim();
    }
  } catch (_e) { /* empty/invalid body -> listings batch */ }

  // ---- 1. Pull pending listings (or the one lead, shaped like a listing) ----
  let listings: any[] = [];
  if (leadId) {
    const leadRes = await fetch(
      `${SB_BASE}/leads?id=eq.${leadId}&select=id,ref,kind,year,make,model,trim,canon_model,canon_trim,mileage,asking_price,message,mods_text,condition,title_status,owner_count,has_records,intent,photo_count&limit=1`,
      { headers: SB_HEADERS },
    );
    if (!leadRes.ok) {
      return json({ ok: false, error: `Supabase lead read ${leadRes.status}: ${await leadRes.text()}` }, 500);
    }
    const leadRows = await leadRes.json();
    const lead = Array.isArray(leadRows) && leadRows.length ? leadRows[0] : null;
    if (!lead) return json({ ok: false, error: "lead not found", lead_id: leadId }, 404);
    if (lead.kind !== "sell") return json({ ok: false, error: "lead is not a sell lead", lead_id: leadId }, 400);

    const model = lead.canon_model || lead.model || null;
    const trim = lead.canon_trim || lead.trim || null;
    const title = [lead.year, lead.make, model, trim].filter((x: unknown) => x !== null && x !== undefined && String(x).trim() !== "").join(" ");
    const excerptParts: string[] = [];
    if (lead.message) excerptParts.push(String(lead.message));
    if (lead.mods_text) excerptParts.push("Modifications: " + String(lead.mods_text));
    if (lead.condition) excerptParts.push("Condition: " + String(lead.condition));
    if (lead.title_status) excerptParts.push("Title: " + String(lead.title_status));
    if (typeof lead.owner_count === "number") excerptParts.push("Owners: " + String(lead.owner_count));
    if (lead.has_records === true) excerptParts.push("Service records available");
    if (lead.intent) excerptParts.push("Seller intent: " + String(lead.intent));
    if (typeof lead.photo_count === "number") excerptParts.push(String(lead.photo_count) + " seller photos on file");
    listings = [{
      id: lead.id,
      title,
      excerpt: excerptParts.length ? excerptParts.join(". ") : null,
      make: lead.make,
      model,
      trim,
      year: lead.year,
      price: lead.asking_price,
      mileage: lead.mileage,
      exterior_color: null,
      interior_color: null,
      options: [],
      listing_url: null,
      _lead_ref: lead.ref,
    }];
  } else {
    const listingsRes = await fetch(
      `${SB_BASE}/listings?detected_specs_at=is.null&select=id,title,excerpt,make,model,trim,year,price,mileage,exterior_color,interior_color,options,listing_url&limit=${BATCH_SIZE}`,
      { headers: SB_HEADERS },
    );
    if (!listingsRes.ok) {
      return json({ ok: false, error: `Supabase listings read ${listingsRes.status}: ${await listingsRes.text()}` }, 500);
    }
    listings = await listingsRes.json();
  }

  if (!Array.isArray(listings) || listings.length === 0) {
    return json({ ok: true, note: "No listings pending inference.", processed: 0 });
  }

  // ---- 2. Pull vocabulary, keyed by make -------------------------------
  const makes = [...new Set(listings.map((l: any) => l.make).filter(Boolean))];
  if (makes.length === 0) {
    return json({ ok: true, note: "No listings have a make set.", processed: 0 });
  }

  const makesFilter = `in.(${makes.map((m: string) => `"${m}"`).join(",")})`;
  const vocabRes = await fetch(
    `${SB_BASE}/spec_premiums?make=${makesFilter}&select=spec_name,make,model,trim,category,is_flag`,
    { headers: SB_HEADERS },
  );
  if (!vocabRes.ok) {
    return json({ ok: false, error: `Supabase vocab read ${vocabRes.status}: ${await vocabRes.text()}` }, 500);
  }
  const vocab = await vocabRes.json();

  const vocabByMake: Record<string, any[]> = {};
  for (const row of vocab) {
    if (!vocabByMake[row.make]) vocabByMake[row.make] = [];
    vocabByMake[row.make].push(row);
  }

  // ---- 2b. Pull model_intel for the batch's makes (D1, v2.5) -----------
  const intelRes = await fetch(
    `${SB_BASE}/model_intel?make=${makesFilter}&select=make,model,trim_pattern,edition_name,production_count,identity_tier`,
    { headers: SB_HEADERS },
  );
  if (!intelRes.ok) {
    return json({ ok: false, error: `Supabase model_intel read ${intelRes.status}: ${await intelRes.text()}` }, 500);
  }
  const intelRows = await intelRes.json();

  const intelByMake: Record<string, any[]> = {};
  for (const row of intelRows) {
    if (!intelByMake[row.make]) intelByMake[row.make] = [];
    intelByMake[row.make].push(row);
  }

  // Accent/case fold for identity comparison (Huracán == Huracan).
  const fold = (s: string | null | undefined) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

  // trim_pattern semantics: NULL = any trim; no % = exact fold-equality;
  // contains % = ILIKE-style wildcard match on the folded strings.
  const patternMatches = (pattern: string | null, trim: string | null) => {
    if (pattern === null || pattern === undefined) return true;
    const p = fold(pattern);
    const t = fold(trim);
    if (!p.includes("%")) return t === p;
    if (t === "") return false;
    const rx = new RegExp(
      "^" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$",
      "i",
    );
    return rx.test(t);
  };

  const TIER_RANK: Record<string, number> = { halo: 4, limited: 3, collectible: 2, series: 1 };

  const findIntelFor = (listing: any) => {
    const candidates = (intelByMake[listing.make] || []).filter(
      (r: any) => fold(r.model) === fold(listing.model) && patternMatches(r.trim_pattern, listing.trim),
    );
    if (candidates.length === 0) return null;
    candidates.sort((a: any, b: any) => {
      const tierDiff = (TIER_RANK[b.identity_tier] || 0) - (TIER_RANK[a.identity_tier] || 0);
      if (tierDiff !== 0) return tierDiff;
      return (b.trim_pattern || "").length - (a.trim_pattern || "").length;
    });
    return candidates[0];
  };

  const TIER_GUIDANCE: Record<string, string> = {
    halo: "exceptional by identity — a call-the-seller car regardless of spec",
    limited: "exceptional by identity — numbered/limited production",
    collectible: "at least notable by identity — special variant, not exceptional by badge alone",
    series: "series production — the badge earns nothing; grade on bespoke factors only",
  };

  const buildIntelBlock = (listing: any) => {
    const intel = findIntelFor(listing);
    if (!intel) return "";
    const prod = (typeof intel.production_count === "number")
      ? `${intel.production_count} built`
      : "not a numbered limited run";
    return (
      `MODEL INTEL (authoritative — overrides your own memory AND the identity examples below if they conflict):\n` +
      `This exact identity is: ${intel.edition_name}, production ${prod}, tier guidance: ${TIER_GUIDANCE[intel.identity_tier] || intel.identity_tier}.\n\n`
    );
  };

  // ---- 3. Helper: build vocabulary for ONE listing --------------------
  const buildVocabFor = (listing: any) => {
    const candidates = vocabByMake[listing.make] || [];
    const applicable = candidates.filter(
      (v: any) => v.model === null || v.model === listing.model,
    );
    const seen = new Set<string>();
    const out: { spec_name: string; category: string }[] = [];
    for (const v of applicable) {
      if (seen.has(v.spec_name)) continue;
      seen.add(v.spec_name);
      out.push({ spec_name: v.spec_name, category: v.category });
    }
    return out;
  };

  // ---- 4. Haiku tool schema --------------------------------------------
  const tools = [{
    name: "save_inference",
    description: "Save detected vehicle specs, unmatched observations, and the desirability judgment.",
    input_schema: {
      type: "object",
      properties: {
        detected_specs: {
          type: "array",
          items: { type: "string" },
          description: "Spec names from the provided vocabulary that are present in the title or excerpt. EXACT strings from the vocabulary list only.",
        },
        unmatched_observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              observation: { type: "string" },
              category_guess: { type: "string", enum: ["color", "option", "package", "provenance", "transmission", "other"] },
              why_notable: { type: "string" },
            },
            required: ["observation", "category_guess"],
          },
          description: "Things in the title or excerpt that look spec-like but are NOT in the provided vocabulary. Empty array if nothing notable.",
        },
        desirability: {
          type: "object",
          properties: {
            tier: { type: "string", enum: ["exceptional", "notable", "ordinary"] },
            why: { type: "string", description: "ONE sentence naming the specific factors that drove the tier." },
          },
          required: ["tier", "why"],
          description: "TBTFW desirability judgment for this exact car.",
        },
      },
      required: ["detected_specs", "unmatched_observations", "desirability"],
    },
  }];

  // ---- 5. Per-listing inference ----------------------------------------
  const results: any[] = [];

  for (const listing of listings) {
    try {
      if (!listing.title || !listing.make) {
        results.push({ id: listing.id, url: listing.listing_url, error: "missing title or make" });
        continue;
      }

      const vocabList = buildVocabFor(listing);
      // v2.6: zero-vocab makes fall through to the Haiku grading with an
      // explicit empty-vocabulary block. No early stamp-and-skip.

      const vocabByCategory: Record<string, string[]> = {};
      for (const v of vocabList) {
        if (!vocabByCategory[v.category]) vocabByCategory[v.category] = [];
        vocabByCategory[v.category].push(v.spec_name);
      }
      const vocabBlock = vocabList.length > 0
        ? Object.entries(vocabByCategory)
            .map(([cat, names]) => `  ${cat}: ${names.join(", ")}`)
            .join("\n")
        : "  (none — no spec vocabulary exists for this make; detected_specs MUST be an empty array)";

      const excerptText = (listing.excerpt || "").slice(0, EXCERPT_MAX_CHARS);
      const excerptBlock = excerptText
        ? `  Excerpt: "${excerptText}"`
        : `  Excerpt: (none available)`;
      const optionsBlock = (Array.isArray(listing.options) && listing.options.length > 0)
        ? `  Options: ${listing.options.join("; ").slice(0, 1500)}`
        : `  Options: (none listed)`;
      const colorBlock = `  Colors: ${listing.exterior_color || "(unknown)"} / ${listing.interior_color || "(unknown)"}`;
      const mileageBlock = `  Mileage: ${(typeof listing.mileage === "number") ? listing.mileage + " mi" : "(unknown)"}`;

      const intelBlock = buildIntelBlock(listing);

      const prompt =
        `You are inferring vehicle specifications AND judging desirability for a high-end dealer listing.\n\n` +
        `LISTING:\n` +
        `  Make: ${listing.make}\n` +
        `  Model: ${listing.model || "(unknown)"}\n` +
        `  Trim: ${listing.trim || "(none)"}\n` +
        `  Year: ${listing.year || "(unknown)"}\n` +
        `${mileageBlock}\n` +
        `${colorBlock}\n` +
        `  Title: "${listing.title}"\n` +
        `${excerptBlock}\n` +
        `${optionsBlock}\n\n` +
        intelBlock +
        `Weigh title and excerpt equally. Excerpt often mentions colors, options, and bespoke programs that titles omit.\n\n` +
        `TASK 1 — DETECTED SPECS:\n` +
        `Match the vocabulary list against the title and excerpt. Be GENEROUS on substring/synonym matches. Return EXACT vocabulary strings only.\n\n` +
        `Key synonyms (apply same pattern to all vocab entries):\n` +
        `- "paint-to-sample" / "PTS" → "PTS (Paint to Sample)"\n` +
        `- "Tailor Made" mention → "Tailor Made"\n` +
        `- "Sonderwunsch" / "Porsche Exclusive Manufaktur" → "Sonderwunsch"\n` +
        `- "Ad Personam" → "Ad Personam"\n` +
        `- "Atelier" / "Ferrari Atelier" → "Atelier"\n` +
        `- "Weissach" / "Weissach Package" → "Weissach Package"\n` +
        `- "Daytona seats" → "Daytona Seats"\n` +
        `- "full bucket seats" / "carbon-fiber full buckets" → "Full Bucket Seats"\n` +
        `- "front axle lift" / "lifter" / "lifting system" / "nose lift" → "Front Axle Lift"\n` +
        `- "carbon driver zone" / "carbon-fiber interior trim" → "Carbon Driver Zone"\n` +
        `- "carbon engine bay" / "carbon engine compartment" → "Carbon Engine Bay"\n` +
        `- "Painted Shields" / "Scuderia shields" / "fender shields" → "Painted Shields"\n` +
        `- Factory color name explicitly stated as the car's paint → match that color exactly.\n\n` +
        `Rules:\n` +
        `- Return ONLY exact strings from the vocabulary list.\n` +
        `- Colors require explicit paint mention (not generic "blue" or "red").\n` +
        `- Under-detect ambiguous cases. Empty array is fine.\n\n` +
        `TASK 2 — UNMATCHED OBSERVATIONS:\n` +
        `Anything spec-like (named color, option, package, edition, provenance, tuner) NOT in the vocabulary above. Skip generic descriptors, mileage, year, and trim-already-captured items (LP770-4, LP780-4, etc.). Empty array if nothing notable.\n\n` +
        `TASK 3 — DESIRABILITY (TBTFW standard — a Beverly Hills hypercar dealer's eye):\n` +
        `Grade THIS exact car: exceptional | notable | ordinary.\n` +
        `The meaning of exceptional: a car the dealer would CALL THE SELLER ABOUT the day it lists, if the price were right. The tier answers \"is this car special?\" — NEVER \"is this deal good?\" Price plays no role.\n\n` +
        `IDENTITY FLOOR — LIMITED-PRODUCTION CARS ONLY:\n` +
        `A car is exceptional by identity alone ONLY if it is genuinely limited-production or a factory special: Porsche 911 R, S/T, Speedster, Sport Classic, Dakar, Turbo 50 Years, Exclusive Series, GT2 RS, Spirit 70, numbered Exclusive Manufaktur editions; Ferrari 812 Competizione / Competizione A, F12tdf, Icona or numbered limited series; any make's documented 1-of-N builds, one-offs, homologation specials. These are exceptional regardless of options or mileage — note both in the why.\n\n` +
        `SERIES-PRODUCTION RULE — the badge earns NOTHING:\n` +
        `Regular-production performance cars — 911 Turbo S, GT3, GT3 RS, GTS, Carrera; Ferrari F8, 812 Superfast/GTS, Roma, 296; Lamborghini Huracan, Urus — are NEVER exceptional from the model name or mileage alone. Not even at delivery mileage. To grade exceptional, a series car needs real bespoke factors: PTS or special-order paint, Sonderwunsch / Tailor Made / Ad Personam programs, a rare factory configuration (e.g., GT3 Touring with manual), or documented notable provenance. Delivery mileage on a series car lifts it to AT MOST notable.\n\n` +
        `ORDINARY IS A NORMAL, COMMON GRADE — use it without hesitation:\n` +
        `A production car in common or plain colors with no distinguishing factors is ordinary EVEN IF the badge is prestigious. Calibration examples from the dealer: a GT Silver over black 911 Turbo S with ~5,500 mi and no special options — ORDINARY. A black/black 911 Carrera with no options — ORDINARY. Do not inflate to notable out of respect for the badge.\n\n` +
        `notable: requires AT LEAST ONE specific, nameable factor — a genuinely desirable color-over-color combination, unusually low mileage on a desirable variant, or a documented option package worth paying extra to find. Name the factor in the why.\n` +
        `If information is thin (no excerpt, no options), judge conservatively from what IS known and say so in the why.\n` +
        `why: ONE sentence naming the specific deciding factors.\n\n` +
        `VOCABULARY:\n${vocabBlock}\n\n` +
        `Pass results to the save_inference tool.`;

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 2000,
          tools,
          tool_choice: { type: "tool", name: "save_inference" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!aiRes.ok) throw new Error(`Anthropic ${aiRes.status}: ${await aiRes.text()}`);
      const aiData = await aiRes.json();
      const toolBlock = (aiData.content || []).find((b: any) => b.type === "tool_use");
      const detected = Array.isArray(toolBlock?.input?.detected_specs) ? toolBlock.input.detected_specs : [];
      const unmatched = Array.isArray(toolBlock?.input?.unmatched_observations) ? toolBlock.input.unmatched_observations : [];
      const desirability = toolBlock?.input?.desirability;
      const tier = (desirability && ["exceptional", "notable", "ordinary"].includes(desirability.tier)) ? desirability.tier : null;
      const why = (desirability && typeof desirability.why === "string") ? desirability.why.slice(0, 500) : null;

      const validVocabSet = new Set(vocabList.map((v) => v.spec_name));
      const validatedDetected = detected.filter((s: string) => validVocabSet.has(s));
      const droppedCount = detected.length - validatedDetected.length;

      // v2.7: lead mode writes to leads (no detected_specs_at stamp); listing
      // mode writes to listings exactly as v2.6.
      const patchBody: Record<string, unknown> = {
        detected_specs: validatedDetected,
        unmatched_tokens: unmatched.length > 0 ? unmatched : null,
        desirability_tier: tier,
        desirability_why: why,
      };
      if (!leadId) patchBody.detected_specs_at = new Date().toISOString();
      const updateRes = await fetch(`${SB_BASE}/${leadId ? "leads" : "listings"}?id=eq.${listing.id}`, {
        method: "PATCH",
        headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
        body: JSON.stringify(patchBody),
      });
      if (!updateRes.ok) throw new Error(`Supabase update ${updateRes.status}: ${await updateRes.text()}`);

      results.push({
        id: listing.id,
        title: listing.title,
        detected_specs: validatedDetected,
        unmatched_count: unmatched.length,
        dropped_invalid: droppedCount,
        desirability_tier: tier,
        desirability_why: leadId ? why : undefined,
        no_vocab: vocabList.length === 0,
        model_intel: buildIntelBlock(listing) ? findIntelFor(listing)?.edition_name : null,
        lead_ref: listing._lead_ref || undefined,
      });
    } catch (err) {
      results.push({ id: listing.id, title: listing.title, error: String((err as Error).message || err) });
    }
  }

  return json({ ok: true, mode: leadId ? "lead" : "listings", processed: results.length, pending_before: listings.length, results });
});
