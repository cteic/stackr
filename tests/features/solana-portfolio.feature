Feature: Solana portfolio
  Connecting a Solana wallet is address discovery only — the app reads the
  account, it never signs for it. Once connected, the account's address, its
  SOL balance, its token positions and its activity must all be visible, and
  the token panel must stay honest when the account is empty or the read is
  refused.

  @web
  Scenario: Connecting a Solana wallet surfaces its address and activity
    Given the Phantom extension is installed
    And the Solana account holds SOL, a token position and one past transfer
    When they open the connect modal
    And they connect Phantom
    And they close the connect modal
    Then the connected Solana address appears on the dashboard
    And the recent activity shows the incoming transfer

  @web
  Scenario: A connected Solana wallet shows its balance and its token positions
    Given the Phantom extension is installed
    And the Solana account holds SOL, a token position and one past transfer
    When they open the connect modal
    And they connect Phantom
    And they open the connected Solana wallet
    Then the balance card shows the SOL balance
    And the token list shows the USDC position

  @web
  Scenario: An account holding no tokens says so rather than reporting a fault
    Given the Phantom extension is installed
    And the Solana account holds no tokens
    When they open the connect modal
    And they connect Phantom
    And they open the connected Solana wallet
    Then the token list says the account holds none

  @web
  Scenario: A rate-limited read asks the user to come back shortly
    Given the Phantom extension is installed
    And the Solana reads are being rate limited
    When they open the connect modal
    And they connect Phantom
    And they open the connected Solana wallet
    Then the token list says balances will load again shortly
    And the token list does not report a failed read
