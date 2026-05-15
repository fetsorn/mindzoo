Feature: Catalog locate

  Scenario: Locate by uuid in version record
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    When I locate "abc123"
    Then the result is the path to "alpha"

  Scenario: Locate uuid-only folder
    Given a zoo directory
    And a mind "def456" with uuid "def456" and schema:
      """json
      {"_": "_", "datum": ["sayname"]}
      """
    When I locate "def456"
    Then the result is the path to "def456"

  Scenario: Locate nonexistent mind
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    When I locate "zzz999"
    Then the result is empty
