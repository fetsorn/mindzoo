Feature: Catalog describe

  Scenario: Describe returns mind object with uuid and name
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate", "category"]}
      """
    And the mind "alpha" has branch records:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record", "@ru": "Запись"},
        {"_": "branch", "branch": "actdate", "task": "date", "@en": "Date of the event"},
        {"_": "branch", "branch": "category", "@en": "Category"}
      ]
      """
    And a rebuilt catalog
    When I describe mind "abc123"
    Then the mind object has uuid "abc123"
    And the mind object has name "alpha"
    And the mind object has 3 branches
    And branch "event" has "@en" equal to "Record"
    And branch "event" has "@ru" equal to "Запись"

  Scenario: Describe mind with no origin has no origin fields
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    And a rebuilt catalog
    When I describe mind "abc123"
    Then the mind object has no origin

  Scenario: Describe root self-describes the catalog
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    And a rebuilt catalog
    When I describe mind "root"
    Then the mind object has uuid "root"
