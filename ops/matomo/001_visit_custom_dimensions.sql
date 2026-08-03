DELETE FROM matomo_custom_dimensions
WHERE idsite IN (1, 2) AND idcustomdimension IN (1, 2, 3);

INSERT INTO matomo_custom_dimensions
  (idcustomdimension, idsite, name, `index`, scope, active, extractions, case_sensitive)
VALUES
  (1, 1, 'Source Host', 1, 'visit', 1, '', 1),
  (2, 1, 'Locale', 2, 'visit', 1, '', 1),
  (3, 1, 'Audience Mode', 3, 'visit', 1, '', 1),
  (1, 2, 'Source Host', 1, 'visit', 1, '', 1),
  (2, 2, 'Locale', 2, 'visit', 1, '', 1),
  (3, 2, 'Audience Mode', 3, 'visit', 1, '', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  `index` = VALUES(`index`),
  scope = VALUES(scope),
  active = VALUES(active),
  extractions = VALUES(extractions),
  case_sensitive = VALUES(case_sensitive);
