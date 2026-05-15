Feature: Catalog induct — local mind

  Scenario: Induct creates directory named by name
    Given a zoo directory
    And a rebuilt catalog
    When I induct a mind with uuid "abc123" and name "alpha" and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"},
        {"_": "branch", "branch": "actdate", "trunk": "event", "task": "date", "@en": "Date"}
      ]
      """
    Then the zoo has an "alpha" directory
    And the mind at "alpha" has uuid "abc123" in its version record

  Scenario: Induct with no name uses uuid as folder name
    Given a zoo directory
    And a rebuilt catalog
    When I induct a mind with uuid "abc123" and no name and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"}
      ]
      """
    Then the zoo has an "abc123" directory
    And the mind at "abc123" has uuid "abc123" in its version record

  Scenario: Induct writes schema from branches
    Given a zoo directory
    And a rebuilt catalog
    When I induct a mind with uuid "abc123" and name "alpha" and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"},
        {"_": "branch", "branch": "actdate", "trunk": "event", "task": "date", "@en": "Date"}
      ]
      """
    Then the mind at "alpha" has a schema with "event" trunk

  Scenario: Induct with name collision appends uuid
    Given a zoo directory
    And a mind "alpha" with uuid "existing1" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    And a rebuilt catalog
    When I induct a mind with uuid "abc123" and name "alpha" and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"}
      ]
      """
    Then the zoo has an "alpha-abc123" directory
    And the mind at "alpha-abc123" has uuid "abc123" in its version record
