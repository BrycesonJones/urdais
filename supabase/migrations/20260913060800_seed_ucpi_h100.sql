-- Deterministic Urdais-owned reference data: the UCPI family and its first child.
--
-- Fixed UUIDs so every environment bootstrapped from these migrations agrees on
-- identity. Content hashes are the SHA-256 of the markdown at main e0ec563, the
-- merged Phase 2 state. Both versions are drafts and carry no effective date.
--
-- Nothing external is seeded: no provider, no source interface, no market
-- entity, no canonical region, no observation. No provider is a production
-- constituent.

insert into reference.methodologies (id, slug, name, document_path) values
  ('11111111-0000-4000-8000-000000000001', 'ucpi', 'Urdais Compute Price Index Family', 'docs/methodology/ucpi.md');

insert into reference.methodology_versions (id, methodology_id, version, status, document_path, content_hash) values
  ('11111111-0000-4000-8000-000000000101',
   '11111111-0000-4000-8000-000000000001',
   '0.1.0-draft', 'draft', 'docs/methodology/ucpi.md',
   '08c15e648bde1d1d13119b864dd25a5835385bcbcea205024bbb7fd7a4dc4b1a');

insert into reference.instruments (id, symbol, name, category, methodology_id, output_unit, output_currency, lifecycle_status) values
  ('22222222-0000-4000-8000-000000000001',
   'UCPI-H100-SXM', 'UCPI-H100-SXM', 'compute_price',
   '11111111-0000-4000-8000-000000000001',
   'USD / H100 SXM accelerator-hour', 'USD', 'launch_blocked');

insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path, content_hash) values
  ('22222222-0000-4000-8000-000000000101',
   '22222222-0000-4000-8000-000000000001',
   '11111111-0000-4000-8000-000000000101',
   '0.1.1-draft', 'draft', 'docs/methodology/ucpi-h100-sxm.md',
   'a0d8c49fede1abcd4fe6e073bf2a4114d1b7e17ed7fb55434412b6ee60edceec');
