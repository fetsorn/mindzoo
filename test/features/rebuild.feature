Feature: Catalog rebuild

  Scenario: Rebuild on empty directory
    Given a zoo directory
    When I rebuild the catalog
    Then the zoo has a "root" directory
    And selecting minds from the catalog returns 0 entries

  Scenario: Rebuild discovers minds
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    And a mind "beta" with uuid "def456" and schema:
      """json
      {"_": "_", "datum": ["sayname"]}
      """
    When I rebuild the catalog
    Then selecting minds from the catalog returns 2 entries

  Scenario: Rebuild skips directories without csvs dataset
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    And an empty directory "broken"
    When I rebuild the catalog
    Then selecting minds from the catalog returns 1 entry

  Scenario: Rebuild is idempotent
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    When I rebuild the catalog
    And I rebuild the catalog
    Then selecting minds from the catalog returns 1 entry
