Feature: Backup ceremony
  The recovery phrase backs BTC, STX, and SUI — it can only be revealed
  deliberately (auth gate, hold to reveal), and the app must keep nudging
  until the user proves they backed it up.

  @mobile
  Scenario: The recovery phrase is gated behind re-authentication
    Given a signed-in wallet that has not been backed up
    When they open the backup section
    Then they see the backup warning copy
    And revealing requires device authentication

  @mobile
  Scenario: Hold to reveal shows the phrase and the quiz retires the nudge
    Given a signed-in wallet that has not been backed up
    When they open the backup section
    And they pass device authentication
    And they hold to reveal
    Then the numbered word grid is visible
    When they answer the two-word quiz correctly
    Then the backup banner is gone from the balance screen

  @mobile
  Scenario: The backup banner persists until verified
    Given a signed-in wallet that has not been backed up
    When they open the balance screen
    Then the backup banner is visible
