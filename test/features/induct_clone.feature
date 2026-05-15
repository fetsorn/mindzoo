Feature: Catalog induct — clone from remote

  Scenario: Induct with origin clones the remote
    Given a zoo directory
    And a rebuilt catalog
    And a mock git server with repo "test-mind" that has uuid "remoteid"
    When I induct a mind with uuid "abc123" and name "alpha" and origin "{server}/test-mind" and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"}
      ]
      """
    Then the zoo has an "alpha" directory
    And the mind at "alpha" contains files from the remote

  Scenario: Clone writes mind entry to catalog
    Given a zoo directory
    And a rebuilt catalog
    And a mock git server with repo "test-mind" that has uuid "remoteid"
    When I induct a mind with uuid "abc123" and name "alpha" and origin "{server}/test-mind" and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"}
      ]
      """
    Then selecting minds from the catalog returns 1 entry
