import type { Metadata } from 'next';
import { LegalPage, LegalSection, SupportMailLink } from '@/components/legal-page';
import { SUPPORT_FAQ } from '@/lib/legal';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: `Support — ${SITE_NAME}`,
  description:
    'Get help with stackr.ie and the Stackr Wallet app: contact support and read answers on connecting wallets, alerts, non-custodial keys, deleting your account and recovery phrases.',
  alternates: { canonical: '/support' },
};

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      path="/support"
      intro="Get help with stackr.ie and the Stackr Wallet app."
    >
      <LegalSection title="Contact">
        <p>
          Email <SupportMailLink />. Tell us which app you are using (web or Stackr Wallet), your
          browser or phone, and what happened.
        </p>
        <p className="font-medium text-foreground">
          Never send your recovery phrase or private keys to anyone, including us. We will never ask
          for them.
        </p>
      </LegalSection>

      <LegalSection title="Frequently asked questions">
        <dl className="space-y-6">
          {SUPPORT_FAQ.map(entry => (
            <div key={entry.question} className="space-y-1.5">
              <dt className="font-semibold text-foreground">{entry.question}</dt>
              <dd>{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </LegalSection>
    </LegalPage>
  );
}
