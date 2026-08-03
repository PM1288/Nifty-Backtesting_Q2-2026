INSERT INTO matomo_site
  (
    idsite,
    name,
    main_url,
    ts_created,
    ecommerce,
    sitesearch,
    sitesearch_keyword_parameters,
    sitesearch_category_parameters,
    timezone,
    currency,
    exclude_unknown_urls,
    excluded_ips,
    excluded_parameters,
    excluded_user_agents,
    excluded_referrers,
    `group`,
    type,
    keep_url_fragment,
    creator_login
  )
SELECT
  2,
  'Nifty502day Stage',
  'https://stage.nifty50today.co.in/n50-stage',
  COALESCE(ts_created, NOW()),
  ecommerce,
  sitesearch,
  sitesearch_keyword_parameters,
  sitesearch_category_parameters,
  timezone,
  currency,
  exclude_unknown_urls,
  excluded_ips,
  excluded_parameters,
  excluded_user_agents,
  excluded_referrers,
  `group`,
  type,
  keep_url_fragment,
  creator_login
FROM matomo_site
WHERE idsite = 1
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  main_url = VALUES(main_url),
  timezone = VALUES(timezone),
  currency = VALUES(currency),
  sitesearch = VALUES(sitesearch),
  sitesearch_keyword_parameters = VALUES(sitesearch_keyword_parameters),
  sitesearch_category_parameters = VALUES(sitesearch_category_parameters),
  keep_url_fragment = VALUES(keep_url_fragment),
  creator_login = VALUES(creator_login);

INSERT INTO matomo_site_url (idsite, url)
VALUES
  (2, 'http://localhost:19090/n50-stage'),
  (2, 'http://localhost:19090/n50-stage/'),
  (2, 'https://stage.nifty50today.co.in/n50-stage'),
  (2, 'https://stage.nifty50today.co.in/n50-stage/'),
  (2, 'https://n50test.digii4.co.in/n50-stage'),
  (2, 'https://n50test.digii4.co.in/n50-stage/')
ON DUPLICATE KEY UPDATE
  url = VALUES(url);
