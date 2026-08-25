Feature: First-run experience
  A brand-new user must understand what Stackr is and reach a populated
  portfolio in one click, on any platform.

  @web
  Scenario: A fresh visitor sees the get-started hero
    Given a fresh visitor
    When they open the dashboard
    Then the get-started hero is visible
    And the "Load demo portfolio" action is available

  @web
  Scenario: Loading the demo portfolio populates the dashboard
    Given a fresh visitor
    When they open the dashboard
    And they load the demo portfolio
    Then a demo wallet appears in the portfolio
    And the get-started hero is gone

  @mobile
  Scenario: Email onboarding reaches a working wallet
    Given a fresh install
    When they sign in with a test email
    Then the balance screen is visible
    And the backup warning is shown once
