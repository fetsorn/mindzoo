Feature: Federation

  Scenario: Settle initializes git and commits
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    When I settle the mind "alpha"
    Then the mind "alpha" has a ".git" directory
    And the git log of "alpha" has at least 1 commit

  Scenario: Settle is idempotent
    Given a zoo directory
    And a mind "alpha" with uuid "abc123" and schema:
      """json
      {"_": "_", "event": ["actdate"]}
      """
    When I settle the mind "alpha"
    And I settle the mind "alpha"
    Then the mind "alpha" has a ".git" directory

  Scenario: Merge theirs pulls remote into stub
    Given a zoo directory
    And a mock git server with repo "test-mind" that has uuid "remoteid"
    And a mind "new-mind" with uuid "stub-uuid" and schema:
      """json
      {"_": "_"}
      """
    When I settle the mind "new-mind"
    And the mind "new-mind" has its origin changed to "{server}/test-mind"
    And I settle the mind "new-mind"
    And I merge "theirs" on mind "new-mind"
    Then the mind "new-mind" contains "csvs/.csvs.csv"

  Scenario: Merge ours keeps local over remote
    Given a zoo directory
    And a mock git server with repo "test-mind" that has uuid "remoteid"
    And a mind "alpha" cloned from "{server}/test-mind"
    When I write a file "csvs/local-file.csv" in mind "alpha"
    And I settle the mind "alpha"
    And I merge "ours" on mind "alpha"
    And I settle the mind "alpha"
    Then the mind "alpha" contains "csvs/local-file.csv"

  Scenario: Induct with origin then merge theirs simulates clone
    Given a zoo directory
    And a mock git server with repo "test-mind" that has uuid "remoteid"
    And a rebuilt catalog
    When I induct a mind with uuid "local-uuid" and name "cloned" and origin "{server}/test-mind" and branches:
      """json
      [
        {"_": "branch", "branch": "event", "@en": "Record"}
      ]
      """
    And I merge "theirs" on mind "cloned"
    And I settle the mind "cloned"
    Then the mind "cloned" contains "csvs/.csvs.csv"
    And the mind at "cloned" has uuid "remoteid" in its version record

  Scenario: Settle with origin pushes without error
    Given a zoo directory
    And a mock git server with repo "test-mind" that has uuid "remoteid"
    And a mind "alpha" cloned from "{server}/test-mind"
    When I write a file "csvs/new-file.csv" in mind "alpha"
    And I settle the mind "alpha"
    Then no error is raised

  Scenario: Settle with origin pulls remote changes
    Given a zoo directory
    And a mock git server with repo "test-mind" that has uuid "remoteid"
    And a mock git server repo "test-mind-updated" that extends "test-mind" with file "csvs/remote-file.csv"
    And a mind "alpha" cloned from "{server}/test-mind"
    When the mind "alpha" has its origin changed to "{server}/test-mind-updated"
    And I settle the mind "alpha"
    Then the mind "alpha" contains "csvs/remote-file.csv"
