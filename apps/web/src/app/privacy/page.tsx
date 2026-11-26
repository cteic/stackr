import type { Metadata } from 'next';
import { LegalList, LegalPage, LegalSection, SupportMailLink } from '@/components/legal-page';
import { OPERATOR_COUNTRY, OPERATOR_NAME } from '@/lib/legal';
import { SITE_NAME } from '@/lib/site';

// A server-rendered page can carry its own metadata; the layout.tsx indirection
// the client-rendered routes use is not needed here.
export const metadata: Metadata = {
  title: `Privacy Policy — ${SITE_NAME}`,
  description:
    'What Stackr and the Stackr Wallet app store, what never leaves your device, which third parties see a public address, and how to delete your data.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      path="/privacy"
      intro="How Stackr handles your data on stackr.ie and in the Stackr Wallet app."
    >
      <LegalSection title="Who we are">
        <p>
          {SITE_NAME} is operated by {OPERATOR_NAME}, based in {OPERATOR_COUNTRY}. Questions about
          this policy go to <SupportMailLink />.
        </p>
      </LegalSection>

      <LegalSection title="The short version">
        <LegalList>
          <li>
            We never see your private keys or recovery phrase. They exist only on your device.
          </li>
          <li>Without an account, your watched addresses and preferences stay in your browser.</li>
          <li>
            With an account, we store your email, the addresses you choose to watch and your alert
            settings, so alerts can reach you.
          </li>
          <li>Analytics is off unless you opt in, and never records your session.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Private keys and recovery phrases">
        <p>
          Stackr Wallet generates your keys on your device and stores them in its hardware-backed
          secure storage: the Secure Enclave and Keychain on iPhone, the Keystore on Android. Keys
          and recovery phrases are never transmitted to Stackr&apos;s servers, never written to
          analytics or logs, and Stackr cannot read, move or recover them.
        </p>
        <p>
          The web app at stackr.ie is watch-only. It reads public addresses and never asks for a key
          or a signature.
        </p>
      </LegalSection>

      <LegalSection title="Data stored in your browser">
        <p>
          The web app keeps the wallet addresses and labels you watch, plus your display preferences
          (currency, theme, hidden balances), in your browser&apos;s local storage. This data is not
          sent to us unless you sign in and enable alerts for a wallet. Clearing the site&apos;s
          data in your browser removes it.
        </p>
      </LegalSection>

      <LegalSection title="Account data (optional)">
        <p>
          Sign-in is by email magic link, handled by Supabase on our behalf. An account is only
          needed for liquidation alerts and pairing with Stackr Wallet. If you create one, we store:
        </p>
        <LegalList>
          <li>your email address;</li>
          <li>the wallet addresses and labels you choose to watch for alerts;</li>
          <li>your alert subscriptions (protocol and risk thresholds);</li>
          <li>
            your push notification subscriptions (the endpoint and keys your browser issues), so
            alerts can be delivered to that device.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Stackr Wallet sign-in">
        <p>
          Stackr Wallet uses Privy for email login. Privy processes your email address and login
          session on our behalf; see Privy&apos;s privacy policy for how it handles that data.
        </p>
      </LegalSection>

      <LegalSection title="Blockchain and market data">
        <p>
          To show balances, activity and prices, Stackr sends the public addresses you watch and the
          assets you follow to third-party data providers: Alchemy, Helius, Etherscan, Alpha Vantage
          and Hiro. These requests go through Stackr&apos;s own Cloudflare Worker proxies, which
          hold the provider API keys so they never reach your browser. No private key ever passes
          through them. Wallet addresses are already public on their blockchains.
        </p>
      </LegalSection>

      <LegalSection title="Analytics">
        <p>
          Stackr uses PostHog for product analytics, and only if you opt in. There is no session
          recording, and events never contain wallet addresses, email addresses or other personal
          data.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Stackr sets no advertising or tracking cookies. If you sign in, a session cookie keeps you
          signed in until you sign out.
        </p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <LegalList>
          <li>Browser data stays until you clear it.</li>
          <li>
            Account data stays until you delete the account. Email <SupportMailLink /> from the
            address you signed in with, and we delete the account with its watched addresses, alert
            subscriptions and push subscriptions.
          </li>
          <li>
            Keys in Stackr Wallet live only on that device. Removing the app removes your access to
            them, so keep your recovery phrase first.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Under the GDPR you can ask to access, correct, delete or export the personal data we hold,
          and object to how we use it. Email <SupportMailLink />. You can also complain to the Data
          Protection Commission in Ireland.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>When this policy changes, we update this page and the date at the top.</p>
      </LegalSection>
    </LegalPage>
  );
}
