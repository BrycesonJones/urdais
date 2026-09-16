-- Open-weight vs Proprietary: the initial evidenced classification set, the canonical model
-- versions it attaches to, and the UTVI identity bridge that carries volume to it.
--
-- This is reference data, not observed data, which is why it belongs in a migration at all.
-- Every row here is a researched fact about a published artifact -- a licence name, a weight
-- repository, a vendor's own statement of how a model is distributed -- and none of it is
-- derived from production observations. The one thing this migration deliberately does *not*
-- do is write a share, a price or a score: those stay derived at read time, as in Market Share
-- and Model Frontier.
--
-- **Why new model rows.** Classification attaches to an exact version, and DeepSeek names its
-- own checkpoints by date (0423, 0731, 0813). `deepseek-v4-pro` in the Token Price catalogue is
-- the dateless API SKU, which is a moving pointer; the observed permaslugs name checkpoints.
-- Collapsing the two would attach a licence finding about one artifact to a different one, so
-- the checkpoints get their own rows and the API SKU keeps its price.
--
-- **Why the date suffix is not always identity.** OpenRouter's permaslugs carry a date for
-- every model, but the publishers do not. Where the publisher's own identifier is dateless and
-- the name is unique -- Laguna S 2.1, MiMo-V2.5, GLM-5.3-Flash, Hy4 preview -- the suffix is
-- OpenRouter's listing date and the link is by name. Where the publisher itself versions by
-- date, the date is part of the identity and a mismatch is a real mismatch. The evidence string
-- on each link says which rule applied.
--
-- Evidence was gathered on 2026-09-16 against publisher artifacts. Secondary reporting was used
-- to locate artifacts, never as the finding itself; where corroboration is weaker than a
-- publisher statement the `corroboration` column says so.

-- ------------------------------------------------------------------ canonical model versions
--
-- Providers already exist: UTVI seeded the model authors it observed, and the news phase seeded
-- NVIDIA as a hardware vendor. NVIDIA is reused rather than re-seeded under a second slug --
-- it is one legal entity that happens to be both, and a duplicate provider would split its
-- models across two identities for no gain.

insert into reference.models (provider_id, provider_model_id, display_name, model_family, version, lifecycle_status)
select p.id, v.provider_model_id, v.display_name, v.model_family, v.version, 'current'
  from (values
    ('deepseek',  'deepseek-v4-flash-0423',           'DeepSeek V4 Flash 0423',        'DeepSeek V4',  'V4-Flash-0423'),
    ('deepseek',  'deepseek-v4-flash-0731',           'DeepSeek V4 Flash 0731',        'DeepSeek V4',  'V4-Flash-0731'),
    ('deepseek',  'deepseek-v4.1-flash',              'DeepSeek V4.1 Flash',           'DeepSeek V4',  'V4.1-Flash'),
    ('deepseek',  'deepseek-v4-pro-0423',             'DeepSeek V4 Pro 0423',          'DeepSeek V4',  'V4-Pro-0423'),
    ('tencent',   'hy4-preview',                      'Hunyuan Hy4 preview',           'Hunyuan Hy',   'Hy4-preview'),
    ('tencent',   'hy3',                              'Hunyuan Hy3',                   'Hunyuan Hy',   'Hy3'),
    ('zhipu-ai',  'glm-5.3-flash',                    'GLM-5.3-Flash',                 'GLM',          '5.3-Flash'),
    ('zhipu-ai',  'glm-5.3',                          'GLM-5.3',                       'GLM',          '5.3'),
    ('zhipu-ai',  'glm-5.2',                          'GLM-5.2',                       'GLM',          '5.2'),
    ('xiaomi',    'mimo-v2.5',                        'MiMo-V2.5',                     'MiMo',         'V2.5'),
    ('nvidia',    'nemotron-3-ultra-550b-a55b',       'Nemotron 3 Ultra 550B A55B',    'Nemotron',     '3-Ultra'),
    ('minimax',   'minimax-m3',                       'MiniMax M3',                    'MiniMax M',    'M3'),
    ('poolside',  'laguna-s-2.1',                     'Laguna S 2.1',                  'Laguna',       'S-2.1'),
    ('upstage',   'solar-pro-4',                      'Solar Pro 4',                   'Solar',        'Pro-4')
  ) as v(provider_slug, provider_model_id, display_name, model_family, version)
  join reference.providers p on p.slug = v.provider_slug
on conflict (provider_id, provider_model_id) do nothing;

-- ------------------------------------------------------------------ access classification

insert into reference.model_access_classes (
  model_id, access_class, evidence_type, evidence_url, evidence_note,
  license_name, publisher, verified_at, verified_by, effective_from, corroboration
)
select m.id, v.access_class, v.evidence_type, v.evidence_url, v.evidence_note,
       v.license_name, v.publisher, date '2026-09-16', 'urdais-open-weight-research',
       v.effective_from::date, v.corroboration
  from (values

    -- ---- weights published under a licence with no field-of-use restriction

    ('deepseek', 'deepseek-v4-flash-0731', 'open_weights_unrestricted',
     'publisher_weight_repository', 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731',
     'DeepSeek publishes the 0731 checkpoint''s weights in its own Hugging Face organisation, MIT-licensed on the model card. This checkpoint superseded the 0423 preview and has been served since 2026-07-31.',
     'MIT', 'DeepSeek', '2026-07-31', null),

    ('deepseek', 'deepseek-v4-flash-0423', 'open_weights_unrestricted',
     'release_documentation', 'https://api-docs.deepseek.com/news/news260424/',
     'DeepSeek''s own release notes for the 2026-04-24 V4 preview state that V4-Pro and V4-Flash shipped both via the DeepSeek API and as open weights on Hugging Face, under MIT.',
     'MIT', 'DeepSeek', '2026-04-24', null),

    ('deepseek', 'deepseek-v4-pro-0423', 'open_weights_unrestricted',
     'release_documentation', 'https://api-docs.deepseek.com/news/news260424/',
     'Same release: the 0423 preview covered both V4 variants. Classified against the 0423 checkpoint, not the later 0813 GA weights, because the observed permaslug names the April checkpoint.',
     'MIT', 'DeepSeek', '2026-04-24', null),

    ('deepseek', 'deepseek-v4.1-flash', 'open_weights_unrestricted',
     'publisher_weight_repository', 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash',
     'Weights published in DeepSeek''s own Hugging Face organisation under MIT at the 2026-09-10 general availability of V4.1 Flash.',
     'MIT', 'DeepSeek', '2026-09-10', null),

    ('tencent', 'hy4-preview', 'open_weights_unrestricted',
     'publisher_weight_repository', 'https://huggingface.co/tencent/Hy4-preview',
     'Tencent published Hy4 preview''s weights in its own Hugging Face organisation under Apache-2.0 on release day, 2026-08-28, alongside an FP8 checkpoint under the same licence.',
     'Apache-2.0', 'Tencent', '2026-08-28', null),

    ('tencent', 'hy3', 'open_weights_unrestricted',
     'release_documentation', 'https://www.tencent.com/tencent-hy3-now-available-globally-extending-practical-ai-across-products-workflows-and-cloud-services/',
     'The July full release of Hy3 is Apache-2.0 with no field-of-use or geographic clause. This is deliberately not the April Hy3 *preview*, which shipped under the restrictive Tencent Hy Community License Agreement; the observed permaslug is dated 2026-07-06 and so names the full release.',
     'Apache-2.0', 'Tencent', '2026-07-06',
     'The licence change between the April preview and the July release is reported by secondary outlets; the Tencent release page is the primary artifact for global availability.'),

    ('zhipu-ai', 'glm-5.3-flash', 'open_weights_unrestricted',
     'publisher_weight_repository', 'https://huggingface.co/zai-org/GLM-5.3-Flash',
     'Z.ai published GLM-5.3-Flash''s weights under the unmodified MIT License on 2026-08-26, the same day it confirmed the model''s identity. Note that the flagship GLM-5.3 is a different licence; see its own row.',
     'MIT', 'Z.ai (Zhipu AI)', '2026-08-26', null),

    ('zhipu-ai', 'glm-5.2', 'open_weights_unrestricted',
     'publisher_weight_repository', 'https://huggingface.co/zai-org/GLM-5.2',
     'GLM-5.2 (June 2026) is published under MIT with no regional usage restriction, and remained so after GLM-5.3 moved to a bespoke licence.',
     'MIT', 'Z.ai (Zhipu AI)', '2026-06-16', null),

    ('xiaomi', 'mimo-v2.5', 'open_weights_unrestricted',
     'publisher_weight_repository', 'https://huggingface.co/XiaomiMiMo/MiMo-V2.5',
     'Xiaomi open-sourced the MiMo-V2.5 series under MIT, stating that commercial deployment, continued training and fine-tuning need no additional authorisation. Weights, tokenizer and model card are published in Xiaomi''s own Hugging Face organisation.',
     'MIT', 'Xiaomi', '2026-04-23', null),

    ('nvidia', 'nemotron-3-ultra-550b-a55b', 'open_weights_unrestricted',
     'publisher_weight_repository', 'https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16',
     'NVIDIA publishes the weights in its own Hugging Face organisation under OpenMDW-1.1, whose only substantive condition is preservation of the licence and origin notices: no field-of-use, commercial or acceptable-use restriction.',
     'OpenMDW-1.1', 'NVIDIA', '2026-06-04', null),

    ('poolside', 'laguna-s-2.1', 'open_weights_unrestricted',
     'publisher_weight_repository', 'https://huggingface.co/poolside/Laguna-S-2.1',
     'Poolside publishes Laguna S 2.1''s weights in its own Hugging Face organisation under OpenMDW-1.1, alongside FP8 and NVFP4 checkpoints. The model is additionally offered through Poolside''s API, which does not change what was published.',
     'OpenMDW-1.1', 'Poolside', '2026-07-21', null),

    -- ---- weights published under a licence that restricts some commercial use
    --
    -- These roll up to open-weight publicly, because the weights are genuinely downloadable.
    -- The licence name travels with the row so the fold is never silent.

    ('zhipu-ai', 'glm-5.3', 'open_weights_restricted',
     'weight_license', 'https://huggingface.co/zai-org/GLM-5.3/raw/main/LICENSE',
     'The flagship GLM-5.3 replaced GLM-5.2''s MIT terms with a bespoke licence requiring model-as-a-service operators above a revenue threshold to pass a security review before commercial use. Downloadable, and not MIT.',
     'GLM-5.3 License', 'Z.ai (Zhipu AI)', '2026-08-28', null),

    ('minimax', 'minimax-m3', 'open_weights_restricted',
     'weight_license', 'https://huggingface.co/MiniMaxAI/MiniMax-M3/raw/main/LICENSE',
     'The MiniMax Community License requires a "Built with MiniMax M3" attribution for commercial use, prior written authorisation above 20 million USD of yearly revenue, and carries an acceptable-use appendix.',
     'MiniMax Community License', 'MiniMax', '2026-06-01', null),

    ('moonshot', 'kimi-k3', 'open_weights_restricted',
     'weight_license', 'https://huggingface.co/moonshotai/Kimi-K3/raw/main/LICENSE',
     'The Kimi K3 License requires a separate agreement for model-as-a-service operators above 20 million USD of revenue over any 12 consecutive months, and prominent "Kimi K3" display above 100 million monthly active users. Hugging Face categorises it as other, not MIT.',
     'Kimi K3 License', 'Moonshot AI', '2026-07-27', null),

    -- ---- offered as hosted access, with no weights published by the publisher
    --
    -- Each of these is a positive finding: the publisher enumerates how the model is obtained
    -- and every channel is hosted. Failing to find weights is not evidence and is not used.

    ('anthropic', 'claude-opus-5', 'api_only_closed_weights',
     'official_pricing_or_access_page', 'https://platform.claude.com/docs/en/about-claude/models/overview',
     'Anthropic''s models overview enumerates every channel by which Claude Opus 5 is obtained -- Claude API, Amazon Bedrock, Google Cloud Vertex AI, Microsoft Foundry and Claude Platform on AWS -- each a hosted endpoint with a model ID. No download or self-hosting channel is offered anywhere on the page.',
     null, 'Anthropic', '2026-07-24', null),

    ('anthropic', 'claude-sonnet-5', 'api_only_closed_weights',
     'official_pricing_or_access_page', 'https://platform.claude.com/docs/en/about-claude/models/overview',
     'Same enumeration: Claude Sonnet 5 is listed with hosted model IDs on five platforms and no downloadable artifact.',
     null, 'Anthropic', '2026-06-30', null),

    ('openai', 'gpt-5.6-sol', 'api_only_closed_weights',
     'release_documentation', 'https://openai.com/index/gpt-5-6/',
     'OpenAI announces the GPT-5.6 family as API and product availability with per-token API pricing. OpenAI separately publishes its open-weight line under the gpt-oss name and states those models are not served through the OpenAI API -- the publisher''s own delineation between the two, which places GPT-5.6 on the hosted side.',
     null, 'OpenAI', '2026-07-09', null),

    ('openai', 'gpt-5.6-luna', 'api_only_closed_weights',
     'release_documentation', 'https://openai.com/index/gpt-5-6/',
     'Same release and same delineation: Luna is the cost-efficient tier of the GPT-5.6 API family, and is not part of the gpt-oss open-weight line.',
     null, 'OpenAI', '2026-07-09', null),

    ('google', 'gemini-3.7-flash', 'api_only_closed_weights',
     'official_pricing_or_access_page', 'https://ai.google.dev/gemini-api/docs/models',
     'Gemini 3.7 Flash is offered through Google AI Studio, the Gemini API and Vertex AI. Google publishes its downloadable models under the separate Gemma line; the Gemini line is not offered for local deployment.',
     null, 'Google', '2026-08-13',
     'The Gemini/Gemma split is the publisher''s own, but the explicit statement that this version cannot be self-hosted was corroborated from secondary reporting rather than a single quoted vendor sentence.'),

    -- ---- established as not established
    --
    -- Recorded rather than omitted. An absent row and a researched "we could not settle this"
    -- look identical in a count, and only one of them is a finding.

    ('upstage', 'solar-pro-4', 'unknown',
     'no_evidence_found', null,
     'Upstage publishes open weights for Solar Open 2 but no weight repository was located for Solar Pro 4, and no first-party Upstage statement was found that says Solar Pro 4 is hosted-only. Secondary comparisons describe it as closed and API-only. That is suggestive and is not positive evidence, so this stays unknown until an Upstage page states the distribution directly.',
     null, 'Upstage', '2026-08-10',
     'Secondary sources describe Solar Pro 4 as closed and API-only; deliberately not relied upon.')

  ) as v(provider_slug, provider_model_id, access_class, evidence_type, evidence_url, evidence_note,
         license_name, publisher, effective_from, corroboration)
  join reference.providers p on p.slug = v.provider_slug
  join reference.models m on m.provider_id = p.id and m.provider_model_id = v.provider_model_id
on conflict do nothing;

-- ------------------------------------------------------------------ UTVI identity bridge
--
-- Keyed on the permaslug verbatim. The evidence string on each row states which identity rule
-- applied, because the two rules are not interchangeable and a future reader must be able to
-- tell which one a link relied on.

insert into reference.utvi_model_links (source_model_permaslug, model_id, link_state, evidence, linked_by)
select v.permaslug,
       case when v.link_state = 'evidenced' then m.id end,
       v.link_state, v.evidence, 'urdais-open-weight-research'
  from (values
    ('deepseek/deepseek-v4-flash-20260731', 'deepseek', 'deepseek-v4-flash-0731', 'evidenced',
     'Publisher versions by date: the permaslug''s 20260731 matches DeepSeek''s own 0731 checkpoint, published and served from 2026-07-31.'),
    ('deepseek/deepseek-v4-flash-20260423', 'deepseek', 'deepseek-v4-flash-0423', 'evidenced',
     'Publisher versions by date: 20260423 matches the 0423 preview checkpoint announced 2026-04-24.'),
    ('deepseek/deepseek-v4.1-flash-20260910', 'deepseek', 'deepseek-v4.1-flash', 'evidenced',
     'V4.1 Flash has a single published checkpoint; 20260910 is its general-availability date.'),
    ('deepseek/deepseek-v4-pro-20260423', 'deepseek', 'deepseek-v4-pro-0423', 'evidenced',
     'Publisher versions by date: 20260423 matches the 0423 V4-Pro preview checkpoint, not the later 0813 GA weights.'),
    ('tencent/hy4-preview-20260827', 'tencent', 'hy4-preview', 'evidenced',
     'Name-exact: "Hy4 preview" is a unique published model and the suffix is the listing date, one day before Tencent''s 2026-08-28 release.'),
    ('tencent/hy3-20260706', 'tencent', 'hy3', 'evidenced',
     'Name-exact against the July full release of Hy3, which the date suffix places after the April preview. The two carry different licences, so the distinction is load bearing.'),
    ('z-ai/glm-5.3-flash-20260826', 'zhipu-ai', 'glm-5.3-flash', 'evidenced',
     'Name-exact: GLM-5.3-Flash, published 2026-08-26. The namespace z-ai resolves to Z.ai (Zhipu AI).'),
    ('z-ai/glm-5.3-20260816', 'zhipu-ai', 'glm-5.3', 'evidenced',
     'Name-exact: the flagship GLM-5.3, which is a different model and a different licence from GLM-5.3-Flash.'),
    ('z-ai/glm-5.2-20260616', 'zhipu-ai', 'glm-5.2', 'evidenced',
     'Name-exact: GLM-5.2, June 2026.'),
    ('xiaomi/mimo-v2.5-20260422', 'xiaomi', 'mimo-v2.5', 'evidenced',
     'Name-exact: MiMo-V2.5, open-sourced 2026-04-23. Deliberately not MiMo-V2.5-Pro, which is a separate model.'),
    ('nvidia/nemotron-3-ultra-550b-a55b-20260604:free', 'nvidia', 'nemotron-3-ultra-550b-a55b', 'evidenced',
     'Name-exact including the parameter descriptor. The :free suffix is a serving variant and does not change the model.'),
    ('minimax/minimax-m3-20260531', 'minimax', 'minimax-m3', 'evidenced',
     'Name-exact: MiniMax M3, the single published M3 checkpoint.'),
    ('minimax/minimax-m3-20260531:free', 'minimax', 'minimax-m3', 'evidenced',
     'The same model served under a free variant; the variant is a serving arrangement, not a model.'),
    ('moonshotai/kimi-k3-20260715', 'moonshot', 'kimi-k3', 'evidenced',
     'Name-exact: Kimi K3. The moonshotai namespace resolves to Moonshot AI, already canonical from Token Price wave 3.'),
    ('poolside/laguna-s-2.1-20260720:free', 'poolside', 'laguna-s-2.1', 'evidenced',
     'Name-exact: Laguna S 2.1, whose weights Poolside published 2026-07-21.'),
    ('upstage/solar-pro4-20260810', 'upstage', 'solar-pro-4', 'evidenced',
     'Name-exact modulo the publisher''s own spacing: "solar-pro4" is Solar Pro 4. The model is linked; its access class is separately recorded as unknown.'),
    ('openai/gpt-5.6-luna-20260709', 'openai', 'gpt-5.6-luna', 'evidenced',
     'Name-exact against OpenAI''s API model id; 20260709 is the GPT-5.6 family''s general-availability date.'),
    ('openai/gpt-5.6-sol-20260709', 'openai', 'gpt-5.6-sol', 'evidenced',
     'Name-exact against OpenAI''s API model id, same GA date.'),
    ('anthropic/claude-opus-5-20260723', 'anthropic', 'claude-opus-5', 'evidenced',
     'Name-exact against Anthropic''s published model ID claude-opus-5, which is itself a pinned snapshot.'),
    ('anthropic/claude-sonnet-5-20260630', 'anthropic', 'claude-sonnet-5', 'evidenced',
     'Name-exact against Anthropic''s published model ID claude-sonnet-5.'),
    ('google/gemini-3.7-flash-20260813', 'google', 'gemini-3.7-flash', 'evidenced',
     'Name-exact against Google''s published model id gemini-3.7-flash.'),

    -- The one refusal, and the largest single identifier Urdais will not resolve.
    ('stealth/ox-alpha', null, null, 'not_applicable',
     'An anonymised stealth endpoint. Z.ai later stated publicly that the Ox Alpha endpoint was GLM-5.3-Flash, but the permaslug names a routing alias rather than a published SKU, and Urdais cannot establish which model served the volume recorded under it on any given date. Its volume is kept and reported as Unclassified rather than assigned to either class on a press statement.')
  ) as v(permaslug, provider_slug, provider_model_id, link_state, evidence)
  left join reference.providers p on p.slug = v.provider_slug
  left join reference.models m on m.provider_id = p.id and m.provider_model_id = v.provider_model_id
on conflict (source_model_permaslug) do nothing;

-- Every link that claims to be evidenced must have landed on a model. A silently-null model_id
-- here would become Unclassified volume that looks like unfinished identity work, which is
-- exactly the number this table exists to make trustworthy.
do $$
declare
  n integer;
begin
  select count(*) into n from reference.utvi_model_links where link_state = 'evidenced' and model_id is null;
  if n <> 0 then raise exception 'open-weight bridge: % evidenced links resolved to no model', n; end if;

  select count(*) into n from reference.model_access_classes where superseded_by_id is null;
  if n < 20 then raise exception 'open-weight: expected at least 20 live classifications, found %', n; end if;
end $$;
