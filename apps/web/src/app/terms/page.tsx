import type { Metadata } from 'next';
import { LegalList, LegalPage, LegalSection, SupportMailLink } from '@/components/legal-page';
import { OPERATOR_COUNTRY, OPERATOR_NAME } from '@/lib/legal';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: `Terms of Service — ${SITE_NAME}`,
  description:
    'The terms for using stackr.ie and the Stackr Wallet app: an informational tool and non-custodial signer, not financial advice, not an exchange, no custody.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      path="/terms"
      intro="The rules for using stackr.ie and the Stackr Wallet app."
    >
      <LegalSection title="Who we are">
        <p>
          {SITE_NAME} is operated by {OPERATOR_NAME}, based in {OPERATOR_COUNTRY} (&quot;we&quot;).
          Contact us at <SupportMailLink />.
        </p>
      </LegalSection>

      <LegalSection title="Agreement">
        <p>
          By using stackr.ie or Stackr Wallet (together, the &quot;services&quot;) you accept these
          terms. If you do not accept them, do not use the services.
        </p>
      </LegalSection>

      <LegalSection title="What Stackr is">
        <p>
          Stackr is an informational tool. It reads public blockchain data and market feeds and
          shows them to you. Stackr Wallet is a non-custodial signer: it creates keys on your device
          and signs only what you approve.
        </p>
        <p>
          Stackr is not an exchange, broker, bank, custodian or payment service. We do not hold,
          transfer or have access to your funds, and no trades take place on Stackr.
        </p>
      </LegalSection>

      <LegalSection title="No financial advice">
        <p>
          Balances, prices, liquidation health and every other figure shown are information, not
          advice. The data comes from third parties and can be delayed, incomplete or wrong. Verify
          anything before you act on it. Decisions about your assets are yours, and you bear the
          risk of them.
        </p>
      </LegalSection>

      <LegalSection title="Non-custodial: your keys, your responsibility">
        <LegalList>
          <li>
            Your keys and recovery phrase exist only on your device. Stackr cannot access, move,
            freeze or recover your funds, reset a passcode, or restore a lost phrase.
          </li>
          <li>
            You are responsible for backing up your recovery phrase and keeping it secret. If you
            lose it, the funds it controls are lost. Anyone who has it controls those funds.
          </li>
          <li>
            Review every signing request before you approve it. A signed transaction cannot be
            reversed.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          An account is optional and only unlocks alerts and pairing. Keep the email address you
          sign in with secure; you are responsible for activity from your account. We may suspend an
          account that abuses the services.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <LegalList>
          <li>use the services for anything unlawful, or where they are prohibited;</li>
          <li>disrupt, probe or overload the services, or bypass their limits;</li>
          <li>scrape or bulk-collect the data feeds through the services;</li>
          <li>
            breach laws that apply to you, including tax and sanctions law, when using the services.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Alerts">
        <p>
          Liquidation alerts are best effort. They can be delayed or missed because of network,
          data-provider or device conditions. Do not rely on alerts alone to manage a position.
        </p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          We may change, suspend or discontinue any part of the services at any time, and we have no
          obligation to keep any feature running.
        </p>
      </LegalSection>

      <LegalSection title="Intellectual property">
        <p>
          The Stackr name, design and software are protected by copyright and related rights. The
          source code is published for reference under the terms of its licence file; no other
          licence is granted.
        </p>
      </LegalSection>

      <LegalSection title="Third-party services">
        <p>
          Blockchain networks, browser wallets, Privy, Supabase and the data providers named in our
          privacy policy are independent services with their own terms. We are not responsible for
          them.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          The services are provided &quot;as is&quot; and &quot;as available&quot;, without
          warranties of any kind, including accuracy, availability or fitness for a particular
          purpose.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, {OPERATOR_NAME} is not liable for any loss of
          funds, loss of data, lost profits, or indirect or consequential loss arising from the
          services, including loss caused by third-party data, blockchain networks, wallet software,
          lost keys or unauthorised access to your device. Nothing in these terms limits liability
          that cannot be limited under Irish law.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of Ireland, and the courts of Ireland have exclusive
          jurisdiction over any dispute about them. If you are a consumer, mandatory consumer
          protections of your country of residence are not affected.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          When these terms change, we update this page and the date at the top. Continuing to use
          the services after a change means you accept the new terms.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
