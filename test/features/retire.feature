Feature: Catalog retire

  Scenario: Retire existing mind removes directory
    Given a zoo directory
    And a mind "abc123-alpha" with schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    When I retire "abc123"
    Then the zoo does not have a "abc123-alpha" directory

  Scenario: Retire nonexistent mind does not error
    Given a zoo directory
    When I retire "zzz999"
    Then no error is raised
