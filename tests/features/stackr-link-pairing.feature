Feature: Stackr Link pairing
  The mobile wallet pairs with the web portfolio by QR over an end-to-end
  encrypted channel. Addresses flow wallet → web; keys never leave the phone.

  @web
  Scenario: Pairing is unavailable without the sync service
    Given the sync service is not configured
    When they open the connect modal
    Then the Stackr Wallet entry is unavailable
    And the sync service explainer is shown

  @web
  Scenario: Pairing shows a QR code when the sync service is configured
    Given the sync service is configured
    When they open the connect modal
    And they choose to pair Stackr Wallet
    Then a pairing QR code is shown

  @mobile
  Scenario: Scanning the web QR announces the wallet's addresses
    Given a signed-in wallet
    When they open the link screen
    And they scan the pairing QR code
    Then the paired state is shown
