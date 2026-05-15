Feature: Catalog induct — existing mind

  Scenario: Induct existing mind with new name renames folder
    Given a zoo directory
    And a mind "abc123-alpha" with schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    And a rebuilt catalog
    When I induct a mind with uuid "abc123" and name "renamed" and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"},
        {"_": "branch", "branch": "actdate", "trunk": "event", "@en": "Date"}
      ]
      """
    Then the zoo has a "abc123-renamed" directory
    And the zoo does not have a "abc123-alpha" directory

  Scenario: Induct existing mind with same name keeps folder
    Given a zoo directory
    And a mind "abc123-alpha" with schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    And a rebuilt catalog
    When I induct a mind with uuid "abc123" and name "alpha" and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"},
        {"_": "branch", "branch": "actdate", "trunk": "event", "@en": "Date"}
      ]
      """
    Then the zoo has a "abc123-alpha" directory

  Scenario: Induct existing mind with new branches overwrites schema
    Given a zoo directory
    And a mind "abc123-alpha" with schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    And a rebuilt catalog
    When I induct a mind with uuid "abc123" and name "alpha" and branches:
      """json
      [
        {"_": "branch", "branch": "datum", "@en": "Entry"},
        {"_": "branch", "branch": "sayname", "trunk": "datum", "@en": "Name"}
      ]
      """
    Then the mind at "abc123-alpha" has a schema with "datum" trunk
