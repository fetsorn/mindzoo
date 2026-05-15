Feature: Catalog induct — local mind

  Scenario: Induct new mind creates uuid-name directory
    Given a zoo directory
    And a rebuilt catalog
    When I induct a mind with uuid "abc123" and name "alpha" and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"},
        {"_": "branch", "branch": "actdate", "trunk": "event", "task": "date", "@en": "Date"}
      ]
      """
    Then the zoo has a "abc123-alpha" directory

  Scenario: Induct new mind with no name uses uuid-only folder
    Given a zoo directory
    And a rebuilt catalog
    When I induct a mind with uuid "abc123" and no name and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"}
      ]
      """
    Then the zoo has a "abc123" directory

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
    Then the mind at "abc123-alpha" has a schema with "event" trunk
