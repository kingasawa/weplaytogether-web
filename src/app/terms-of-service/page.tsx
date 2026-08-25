import type { Metadata } from "next";
import { Gamepad2, House } from "lucide-react";
import Link from "next/link";
import styles from "../legal.module.css";

const effectiveDate = "August 18, 2026";
const contactEmail = "support@weplaytogether.online";

export const metadata: Metadata = {
  title: "Terms of Service | WePlayTogether",
  description: "Terms of Service for using WePlayTogether.",
};

export default function TermsOfServicePage() {
  return (
    <main className={styles.page} lang="en">
      <nav className={styles.topbar} aria-label="Legal navigation">
        <Link className={styles.brand} href="/" aria-label="WePlayTogether home">
          <span className={styles.brandIcon}>
            <Gamepad2 aria-hidden="true" />
          </span>
          <span className={styles.brandText}>
            <strong>BOARDVERSE</strong>
            <small>WE PLAY TOGETHER</small>
          </span>
        </Link>

        <Link className={styles.homeLink} href="/">
          <House aria-hidden="true" />
          Home
        </Link>
      </nav>

      <article className={styles.document}>
        <p className={styles.kicker}>Terms of Service</p>
        <h1>Terms of Service</h1>
        <p className={styles.updated}>Effective date: {effectiveDate}</p>

        <p className={styles.lead}>
          These Terms of Service govern your access to and use of WePlayTogether, an online board game platform available at
          weplaytogether.online. By using WePlayTogether, you agree to these Terms.
        </p>

        <section>
          <h2>1. The Service</h2>
          <p>
            WePlayTogether lets users create, join, and play online board game rooms with friends and other players. Some
            features may be available to guests, and some features may require Google Sign-In.
          </p>
        </section>

        <section>
          <h2>2. Eligibility</h2>
          <p>
            You must be able to form a legally binding agreement to use WePlayTogether. If you are under the age required by
            law in your location, you may use the service only with permission and supervision from a parent or legal
            guardian.
          </p>
        </section>

        <section>
          <h2>3. Accounts and Google Sign-In</h2>
          <p>
            When you sign in with Google, you authorize WePlayTogether to use basic Google account information, such as your
            email address and display name, to authenticate you and provide the service. You are responsible for keeping
            your account secure and for activity that occurs through your account or game session.
          </p>
        </section>

        <section>
          <h2>4. User Content</h2>
          <p>
            You may provide player names, avatar selections, uploaded avatar images, room settings, chat-like gameplay
            signals if available, and other information needed for gameplay. You retain ownership of content you submit,
            but you grant WePlayTogether a limited license to host, display, store, process, and transmit that content as
            needed to operate the service.
          </p>
          <p>You agree not to upload, submit, or share content that:</p>
          <ul>
            <li>is unlawful, abusive, harassing, hateful, threatening, or deceptive;</li>
            <li>infringes another person&apos;s rights, including privacy or intellectual property rights;</li>
            <li>contains malware, spam, or attempts to interfere with the service;</li>
            <li>includes sensitive personal information about another person without permission.</li>
          </ul>
        </section>

        <section>
          <h2>5. Fair Play and Acceptable Use</h2>
          <p>You agree not to misuse WePlayTogether. Prohibited conduct includes:</p>
          <ul>
            <li>attempting to disrupt, overload, reverse engineer, or bypass security protections;</li>
            <li>using automation, scraping, or bots unless we have given written permission;</li>
            <li>impersonating another person or misrepresenting your identity;</li>
            <li>using the service for gambling, real-money wagering, or illegal activity;</li>
            <li>harassing other players or intentionally ruining games outside normal gameplay rules.</li>
          </ul>
        </section>

        <section>
          <h2>6. Privacy</h2>
          <p>
            Our <Link href="/privacy-policy">Privacy Policy</Link> explains how we collect, use, share, retain, and
            delete information. By using WePlayTogether, you acknowledge that your information will be handled as described
            in the Privacy Policy.
          </p>
        </section>

        <section>
          <h2>7. Changes, Availability, and Updates</h2>
          <p>
            WePlayTogether may change, suspend, or discontinue features at any time. We may also update these Terms. When we
            make material changes, we will update the effective date on this page. Your continued use of the service
            after changes become effective means you accept the updated Terms.
          </p>
        </section>

        <section>
          <h2>8. Intellectual Property</h2>
          <p>
            WePlayTogether, including its interface, code, branding, and original assets, is owned by WePlayTogether or its
            licensors. These Terms do not grant you ownership of the service or permission to use WePlayTogether branding
            except as needed to use the service normally.
          </p>
        </section>

        <section>
          <h2>9. Termination</h2>
          <p>
            We may suspend or terminate access to WePlayTogether if we believe you violated these Terms, created risk for
            other users, or caused legal or security concerns. You may stop using the service at any time.
          </p>
        </section>

        <section>
          <h2>10. Disclaimers</h2>
          <p>
            WePlayTogether is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent permitted by law, we do
            not make warranties that the service will be uninterrupted, error-free, secure, or available at all times.
          </p>
        </section>

        <section>
          <h2>11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, WePlayTogether will not be liable for indirect, incidental, special,
            consequential, or punitive damages, or for loss of data, profits, goodwill, or other intangible losses
            resulting from your use of or inability to use the service.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            Questions about these Terms can be sent to{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
        </section>

        <footer className={styles.footerLinks}>
          <Link href="/privacy-policy">Privacy Policy</Link>
          <Link href="/">Return home</Link>
        </footer>
      </article>
    </main>
  );
}
