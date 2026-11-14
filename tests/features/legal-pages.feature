Feature: Legal and support pages
  Store listings and App Review need a reachable privacy policy, terms and
  support contact, and the settings surface must state that Stackr never
  holds keys.

  @web
  Scenario: The footer reaches the privacy policy
    Given a fresh visitor
    When they open the dashboard
    And they follow the "Privacy" footer link
    Then the "Privacy Policy" page heading is visible
    And the "Last updated 16 September 2026" text is shown

  @web
  Scenario: The footer reaches the terms of service
    Given a fresh visitor
    When they open the dashboard
    And they follow the "Terms" footer link
    Then the "Terms of Service" page heading is visible
    And the "Last updated 16 September 2026" text is shown

  @web
  Scenario: The footer reaches support with a way to get in touch
    Given a fresh visitor
    When they open the dashboard
    And they follow the "Support" footer link
    Then the "Support" page heading is visible
    And the "support@stackr.ie" mail link is shown

  @web
  Scenario: Settings states that Stackr is non-custodial
    Given a fresh visitor
    When they open settings
    Then the non-custodial notice is visible
