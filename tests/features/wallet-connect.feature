Feature: Wallet connect lifecycle
  Connecting a wallet is address discovery only — the web app never signs.
  The connect modal must be honest about what is installed, connect and
  disconnect cleanly, and surface the connected address everywhere it matters.

  @web
  Scenario: MetaMask offers an install link when no extension is present
    Given no wallet extensions are installed
    When they open the connect modal
    Then the MetaMask entry offers an install link

  @web
  Scenario: Connecting MetaMask surfaces the address across the app
    Given the MetaMask extension is installed
    When they open the connect modal
    And they connect MetaMask
    Then the MetaMask entry offers disconnect
    When they close the connect modal
    Then the header shows the wallets trigger
    And the connected address appears on the dashboard

  @web
  Scenario: Disconnecting returns the modal to a connectable state
    Given the MetaMask extension is installed
    When they open the connect modal
    And they connect MetaMask
    And they disconnect MetaMask
    Then the MetaMask entry offers connect
