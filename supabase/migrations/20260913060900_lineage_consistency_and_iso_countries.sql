-- Lineage consistency and ISO 3166-1 membership.
--
-- Review of PR #32 found two integrity gaps. First, normalized_observations
-- carried instrument_id, instrument_spec_version_id and methodology_version_id
-- as three independent foreign keys, so a row could name an H200 instrument,
-- an H100 spec version and an unrelated methodology version at once; the same
-- independence existed between an eligibility assessment and its observation.
-- Second, canonical_regions proved only "two uppercase letters, not reserved",
-- not membership in ISO 3166-1. Both are closed here relationally, so nothing
-- depends on application code getting it right.

-- 1. ISO 3166-1 alpha-2 reference set.
--
-- Source: the IANA Time Zone Database's iso3166.tab (public domain), current
-- as of ISO/TC 46 N1127 (2024-02-29), 249 officially assigned codes. Names are
-- the tz database's short English names and are informational; the code is
-- the fact. An adopted canonical region must be one of these codes.

create table reference.iso_countries (
  code  char(2) primary key
          constraint iso_countries_code_format check (code ~ '^[A-Z]{2}$'),
  name  text not null
);

comment on table reference.iso_countries is
  'ISO 3166-1 alpha-2 officially assigned codes, from the IANA tz database iso3166.tab (ISO/TC 46 N1127, 2024-02-29). Reference set only; adoption as a canonical region is a separate row in canonical_regions.';

insert into reference.iso_countries (code, name) values
  ('AD', 'Andorra'),
  ('AE', 'United Arab Emirates'),
  ('AF', 'Afghanistan'),
  ('AG', 'Antigua & Barbuda'),
  ('AI', 'Anguilla'),
  ('AL', 'Albania'),
  ('AM', 'Armenia'),
  ('AO', 'Angola'),
  ('AQ', 'Antarctica'),
  ('AR', 'Argentina'),
  ('AS', 'Samoa (American)'),
  ('AT', 'Austria'),
  ('AU', 'Australia'),
  ('AW', 'Aruba'),
  ('AX', 'Åland Islands'),
  ('AZ', 'Azerbaijan'),
  ('BA', 'Bosnia & Herzegovina'),
  ('BB', 'Barbados'),
  ('BD', 'Bangladesh'),
  ('BE', 'Belgium'),
  ('BF', 'Burkina Faso'),
  ('BG', 'Bulgaria'),
  ('BH', 'Bahrain'),
  ('BI', 'Burundi'),
  ('BJ', 'Benin'),
  ('BL', 'St Barthelemy'),
  ('BM', 'Bermuda'),
  ('BN', 'Brunei'),
  ('BO', 'Bolivia'),
  ('BQ', 'Caribbean NL'),
  ('BR', 'Brazil'),
  ('BS', 'Bahamas'),
  ('BT', 'Bhutan'),
  ('BV', 'Bouvet Island'),
  ('BW', 'Botswana'),
  ('BY', 'Belarus'),
  ('BZ', 'Belize'),
  ('CA', 'Canada'),
  ('CC', 'Cocos (Keeling) Islands'),
  ('CD', 'Congo (Dem. Rep.)'),
  ('CF', 'Central African Rep.'),
  ('CG', 'Congo (Rep.)'),
  ('CH', 'Switzerland'),
  ('CI', 'Côte d’Ivoire'),
  ('CK', 'Cook Islands'),
  ('CL', 'Chile'),
  ('CM', 'Cameroon'),
  ('CN', 'China'),
  ('CO', 'Colombia'),
  ('CR', 'Costa Rica'),
  ('CU', 'Cuba'),
  ('CV', 'Cape Verde'),
  ('CW', 'Curaçao'),
  ('CX', 'Christmas Island'),
  ('CY', 'Cyprus'),
  ('CZ', 'Czech Republic'),
  ('DE', 'Germany'),
  ('DJ', 'Djibouti'),
  ('DK', 'Denmark'),
  ('DM', 'Dominica'),
  ('DO', 'Dominican Republic'),
  ('DZ', 'Algeria'),
  ('EC', 'Ecuador'),
  ('EE', 'Estonia'),
  ('EG', 'Egypt'),
  ('EH', 'Western Sahara'),
  ('ER', 'Eritrea'),
  ('ES', 'Spain'),
  ('ET', 'Ethiopia'),
  ('FI', 'Finland'),
  ('FJ', 'Fiji'),
  ('FK', 'Falkland Islands'),
  ('FM', 'Micronesia'),
  ('FO', 'Faroe Islands'),
  ('FR', 'France'),
  ('GA', 'Gabon'),
  ('GB', 'Britain (UK)'),
  ('GD', 'Grenada'),
  ('GE', 'Georgia'),
  ('GF', 'French Guiana'),
  ('GG', 'Guernsey'),
  ('GH', 'Ghana'),
  ('GI', 'Gibraltar'),
  ('GL', 'Greenland'),
  ('GM', 'Gambia'),
  ('GN', 'Guinea'),
  ('GP', 'Guadeloupe'),
  ('GQ', 'Equatorial Guinea'),
  ('GR', 'Greece'),
  ('GS', 'South Georgia & the South Sandwich Islands'),
  ('GT', 'Guatemala'),
  ('GU', 'Guam'),
  ('GW', 'Guinea-Bissau'),
  ('GY', 'Guyana'),
  ('HK', 'Hong Kong'),
  ('HM', 'Heard Island & McDonald Islands'),
  ('HN', 'Honduras'),
  ('HR', 'Croatia'),
  ('HT', 'Haiti'),
  ('HU', 'Hungary'),
  ('ID', 'Indonesia'),
  ('IE', 'Ireland'),
  ('IL', 'Israel'),
  ('IM', 'Isle of Man'),
  ('IN', 'India'),
  ('IO', 'British Indian Ocean Territory'),
  ('IQ', 'Iraq'),
  ('IR', 'Iran'),
  ('IS', 'Iceland'),
  ('IT', 'Italy'),
  ('JE', 'Jersey'),
  ('JM', 'Jamaica'),
  ('JO', 'Jordan'),
  ('JP', 'Japan'),
  ('KE', 'Kenya'),
  ('KG', 'Kyrgyzstan'),
  ('KH', 'Cambodia'),
  ('KI', 'Kiribati'),
  ('KM', 'Comoros'),
  ('KN', 'St Kitts & Nevis'),
  ('KP', 'Korea (North)'),
  ('KR', 'Korea (South)'),
  ('KW', 'Kuwait'),
  ('KY', 'Cayman Islands'),
  ('KZ', 'Kazakhstan'),
  ('LA', 'Laos'),
  ('LB', 'Lebanon'),
  ('LC', 'St Lucia'),
  ('LI', 'Liechtenstein'),
  ('LK', 'Sri Lanka'),
  ('LR', 'Liberia'),
  ('LS', 'Lesotho'),
  ('LT', 'Lithuania'),
  ('LU', 'Luxembourg'),
  ('LV', 'Latvia'),
  ('LY', 'Libya'),
  ('MA', 'Morocco'),
  ('MC', 'Monaco'),
  ('MD', 'Moldova'),
  ('ME', 'Montenegro'),
  ('MF', 'St Martin (French)'),
  ('MG', 'Madagascar'),
  ('MH', 'Marshall Islands'),
  ('MK', 'North Macedonia'),
  ('ML', 'Mali'),
  ('MM', 'Myanmar (Burma)'),
  ('MN', 'Mongolia'),
  ('MO', 'Macau'),
  ('MP', 'Northern Mariana Islands'),
  ('MQ', 'Martinique'),
  ('MR', 'Mauritania'),
  ('MS', 'Montserrat'),
  ('MT', 'Malta'),
  ('MU', 'Mauritius'),
  ('MV', 'Maldives'),
  ('MW', 'Malawi'),
  ('MX', 'Mexico'),
  ('MY', 'Malaysia'),
  ('MZ', 'Mozambique'),
  ('NA', 'Namibia'),
  ('NC', 'New Caledonia'),
  ('NE', 'Niger'),
  ('NF', 'Norfolk Island'),
  ('NG', 'Nigeria'),
  ('NI', 'Nicaragua'),
  ('NL', 'Netherlands'),
  ('NO', 'Norway'),
  ('NP', 'Nepal'),
  ('NR', 'Nauru'),
  ('NU', 'Niue'),
  ('NZ', 'New Zealand'),
  ('OM', 'Oman'),
  ('PA', 'Panama'),
  ('PE', 'Peru'),
  ('PF', 'French Polynesia'),
  ('PG', 'Papua New Guinea'),
  ('PH', 'Philippines'),
  ('PK', 'Pakistan'),
  ('PL', 'Poland'),
  ('PM', 'St Pierre & Miquelon'),
  ('PN', 'Pitcairn'),
  ('PR', 'Puerto Rico'),
  ('PS', 'Palestine'),
  ('PT', 'Portugal'),
  ('PW', 'Palau'),
  ('PY', 'Paraguay'),
  ('QA', 'Qatar'),
  ('RE', 'Réunion'),
  ('RO', 'Romania'),
  ('RS', 'Serbia'),
  ('RU', 'Russia'),
  ('RW', 'Rwanda'),
  ('SA', 'Saudi Arabia'),
  ('SB', 'Solomon Islands'),
  ('SC', 'Seychelles'),
  ('SD', 'Sudan'),
  ('SE', 'Sweden'),
  ('SG', 'Singapore'),
  ('SH', 'St Helena'),
  ('SI', 'Slovenia'),
  ('SJ', 'Svalbard & Jan Mayen'),
  ('SK', 'Slovakia'),
  ('SL', 'Sierra Leone'),
  ('SM', 'San Marino'),
  ('SN', 'Senegal'),
  ('SO', 'Somalia'),
  ('SR', 'Suriname'),
  ('SS', 'South Sudan'),
  ('ST', 'Sao Tome & Principe'),
  ('SV', 'El Salvador'),
  ('SX', 'St Maarten (Dutch)'),
  ('SY', 'Syria'),
  ('SZ', 'Eswatini (Swaziland)'),
  ('TC', 'Turks & Caicos Is'),
  ('TD', 'Chad'),
  ('TF', 'French S. Terr.'),
  ('TG', 'Togo'),
  ('TH', 'Thailand'),
  ('TJ', 'Tajikistan'),
  ('TK', 'Tokelau'),
  ('TL', 'East Timor'),
  ('TM', 'Turkmenistan'),
  ('TN', 'Tunisia'),
  ('TO', 'Tonga'),
  ('TR', 'Turkey'),
  ('TT', 'Trinidad & Tobago'),
  ('TV', 'Tuvalu'),
  ('TW', 'Taiwan'),
  ('TZ', 'Tanzania'),
  ('UA', 'Ukraine'),
  ('UG', 'Uganda'),
  ('UM', 'US minor outlying islands'),
  ('US', 'United States'),
  ('UY', 'Uruguay'),
  ('UZ', 'Uzbekistan'),
  ('VA', 'Vatican City'),
  ('VC', 'St Vincent'),
  ('VE', 'Venezuela'),
  ('VG', 'Virgin Islands (UK)'),
  ('VI', 'Virgin Islands (US)'),
  ('VN', 'Vietnam'),
  ('VU', 'Vanuatu'),
  ('WF', 'Wallis & Futuna'),
  ('WS', 'Samoa (western)'),
  ('YE', 'Yemen'),
  ('YT', 'Mayotte'),
  ('ZA', 'South Africa'),
  ('ZM', 'Zambia'),
  ('ZW', 'Zimbabwe');

alter table reference.iso_countries enable row level security;

-- An adopted canonical region must be a real ISO 3166-1 country. The existing
-- format and reserved-code CHECKs stay as a first, clearer line of defence.
alter table reference.canonical_regions
  add constraint canonical_regions_code_is_iso_country
  foreign key (code) references reference.iso_countries (code) on delete restrict;

-- 2. Lineage consistency, enforced by composite foreign keys.
--
-- A spec version row already guarantees, by trigger, that it belongs to its
-- instrument and references a version of that instrument's methodology. Exposing
-- (id, instrument_id, methodology_version_id) as a unique key lets dependent rows
-- reference the whole triple, so the three columns on a normalized observation
-- can only ever be a combination that exists as one spec version row.

alter table reference.instrument_spec_versions
  add constraint instrument_spec_versions_lineage_key
  unique (id, instrument_id, methodology_version_id);

alter table pipeline.normalized_observations
  add constraint normalized_observations_lineage_consistent
  foreign key (instrument_spec_version_id, instrument_id, methodology_version_id)
  references reference.instrument_spec_versions (id, instrument_id, methodology_version_id)
  on delete restrict;

-- Likewise an assessment's spec version and methodology version must be the
-- ones its normalized observation was produced under.
alter table pipeline.normalized_observations
  add constraint normalized_observations_lineage_key
  unique (id, instrument_spec_version_id, methodology_version_id);

alter table pipeline.eligibility_assessments
  add constraint eligibility_assessments_lineage_consistent
  foreign key (normalized_observation_id, instrument_spec_version_id, methodology_version_id)
  references pipeline.normalized_observations (id, instrument_spec_version_id, methodology_version_id)
  on delete restrict;

comment on constraint normalized_observations_lineage_consistent on pipeline.normalized_observations is
  'instrument_id, instrument_spec_version_id and methodology_version_id must together be one existing spec version row.';
comment on constraint eligibility_assessments_lineage_consistent on pipeline.eligibility_assessments is
  'The assessment''s spec version and methodology version must equal those of its normalized observation.';
