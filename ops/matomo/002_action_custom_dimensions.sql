DELETE FROM matomo_custom_dimensions
WHERE idsite IN (1, 2) AND idcustomdimension IN (4, 5, 6, 7, 8, 9, 10);

INSERT INTO matomo_custom_dimensions
  (idcustomdimension, idsite, name, `index`, scope, active, extractions, case_sensitive)
VALUES
  (4, 1, 'Page Family', 4, 'action', 1, '', 1),
  (5, 1, 'Section Name', 5, 'action', 1, '', 1),
  (4, 2, 'Page Family', 4, 'action', 1, '', 1),
  (5, 2, 'Section Name', 5, 'action', 1, '', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  `index` = VALUES(`index`),
  scope = VALUES(scope),
  active = VALUES(active),
  extractions = VALUES(extractions),
  case_sensitive = VALUES(case_sensitive);
