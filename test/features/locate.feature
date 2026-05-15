Feature: Catalog locate

  Scenario: Locate by uuid prefix of folder name
    Given a zoo directory
    And a mind "abc123-alpha" with schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    When I locate "abc123"
    Then the result is the path to "abc123-alpha"

  Scenario: Locate uuid-only folder
    Given a zoo directory
    And a mind "def456" with schema:
      """json
      {"_": "_", "datum": ["sayname"]}
      """
    When I locate "def456"
    Then the result is the path to "def456"

  Scenario: Locate nonexistent mind
    Given a zoo directory
    And a mind "abc123-alpha" with schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    When I locate "zzz999"
    Then the result is empty
