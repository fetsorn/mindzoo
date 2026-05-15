Feature: Federation settle

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

  Scenario: Settle with origin clones into empty directory
    Given a zoo directory
    And a mock git server with repo "test-mind" that has uuid "remoteid"
    When I settle "new-mind" with origin "{server}/test-mind"
    Then the zoo has a "new-mind" directory
    And the mind "new-mind" has a ".git" directory

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
