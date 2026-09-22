-- The Block: the permitted image path follows the publisher's resizing prefix
--
-- On 2026-09-19 The Block began serving its feed artwork through Cloudflare
-- Images: the same asset on the same host, with `/cdn-cgi/image/<options>/`
-- prefixed onto the path. The ingestion allowlist is pinned to path as well as
-- host, so `/wp/uploads/` stopped matching and every thumbnail from that day
-- was stored as NULL against an ENTRY_IMAGE_HOST_NOT_PERMITTED diagnostic.
--
-- That is the gate working. The rights finding was made about the assets under
-- `/wp/uploads/` on the publisher's own host, and a URL shape Urdais had not
-- seen was refused rather than admitted quietly. What changes here is the
-- finding, re-verified against the behaviour the publisher now has.
--
-- The rule stays pinned to the asset path: the resizing prefix is peeled off
-- and `/wp/uploads/` is then required of the path underneath. An arbitrary
-- path on www.tbstat.com is still refused, a transform in front of some other
-- namespace is still refused, and no other source is touched — the opt-in is
-- per source, in `imageHosts` in src/lib/news/sources.ts, which is the gate
-- this row records.

update reference.news_sources
   set image_hosts = array[
         'www.tbstat.com/wp/uploads/',
         'www.tbstat.com/cdn-cgi/image/<options>/wp/uploads/'
       ],
       image_evidence =
         'The feed continues to attach media:content to every item. From 2026-09-19 the URLs changed from '
         || 'https://www.tbstat.com/wp/uploads/... to '
         || 'https://www.tbstat.com/cdn-cgi/image/<options>/wp/uploads/..., the publisher''s own Cloudflare '
         || 'Images resizing path; the underlying asset stays in the /wp/uploads/ namespace the original '
         || 'finding was made about, and both forms are served by the publisher from the same host, which '
         || 'keeps their logs and can stop serving them. Verified 2026-09-21: the retrieved feed carries 20 '
         || 'media:content URLs, all on the transform path over /wp/uploads/; the transformed and direct '
         || 'forms of one asset were each sampled HTTP 200 image/jpeg. Originally verified 2026-09-15, when '
         || 'all 20 URLs were direct /wp/uploads/ and sampled HTTP 200 image/png.'
 where slug = 'the-block';

do $$
begin
  if not exists (
    select 1 from reference.news_sources
     where slug = 'the-block'
       and image_policy = 'feed_media'
       and 'www.tbstat.com/cdn-cgi/image/<options>/wp/uploads/' = any (image_hosts)
  ) then
    raise exception 'the-block image origin was not recorded';
  end if;
  -- The opt-in is one source's. Nothing else may have gained a transform path.
  if exists (
    select 1 from reference.news_sources
     where slug <> 'the-block'
       and exists (select 1 from unnest(image_hosts) h where h like '%/cdn-cgi/image/%')
  ) then
    raise exception 'a source other than the-block carries a transform path';
  end if;
end $$;
