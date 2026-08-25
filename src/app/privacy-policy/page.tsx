import type { Metadata } from "next";
import { Gamepad2, House } from "lucide-react";
import Link from "next/link";
import styles from "../legal.module.css";

const effectiveDate = "August 18, 2026";
const contactEmail = "support@weplaytogether.online";

export const metadata: Metadata = {
  title: "Privacy Policy | WePlayTogether",
  description: "Privacy Policy for WePlayTogether and Google Sign-In data use.",
};

export default function PrivacyPolicyPage() {
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
        <p className={styles.kicker}>Privacy Policy</p>
        <h1>Privacy Policy</h1>
        <p className={styles.updated}>Effective date: {effectiveDate}</p>

        <p className={styles.lead}>
          WePlayTogether, available at weplaytogether.online, is an online board game platform. This Privacy Policy
          explains what information we collect, how we use it, and the choices available to users who sign in with
          Google or use our game rooms.
        </p>

        <p className={styles.notice}>
          We use Google Sign-In only to authenticate users. We do not request access to Gmail, Google Drive, Google
          Calendar, Contacts, or other Google account content.
        </p>

        <section>
          <h2>1. Information We Collect</h2>
          <p>We may collect the following information when you use WePlayTogether:</p>
          <ul>
            <li>
              <strong>Google account information:</strong> your Google account identifier, email address, display name,
              and profile picture if Google provides it during sign-in.
            </li>
            <li>
              <strong>Authentication data:</strong> session information needed to keep you signed in and protect your
              account. Authentication is handled through Supabase.
            </li>
            <li>
              <strong>Game profile information:</strong> player names, selected avatars, uploaded avatar images, room
              membership, readiness state, host status, and gameplay state needed to run each game.
            </li>
            <li>
              <strong>Device and usage information:</strong> basic browser, device, log, and diagnostic information
              needed to secure, debug, and operate the service.
            </li>
            <li>
              <strong>Local storage data:</strong> guest profile preferences such as nickname and avatar selection may
              be stored in your browser so you can continue playing without signing in.
            </li>
          </ul>
        </section>

        <section>
          <h2>2. How We Use Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>authenticate users and maintain sessions;</li>
            <li>create, join, display, and manage board game rooms;</li>
            <li>show player names and avatars to other players in the same game room;</li>
            <li>provide real-time game updates and prevent misuse of the service;</li>
            <li>debug errors, improve reliability, and maintain security;</li>
            <li>respond to support, privacy, or deletion requests.</li>
          </ul>
        </section>

        <section>
          <h2>3. Google User Data</h2>
          <p>
            WePlayTogether uses Google user data only for sign-in, account identification, and displaying your basic profile
            within the service. We do not sell Google user data, use it for advertising, or use it to train generalized
            artificial intelligence models.
          </p>
          <p>
            WePlayTogether uses and transfers information received from Google APIs in accordance with the Google API Services
            User Data Policy, including the Limited Use requirements.
          </p>
        </section>

        <section>
          <h2>4. Sharing and Service Providers</h2>
          <p>We do not sell personal information. We may share limited information only as needed to operate WePlayTogether:</p>
          <ul>
            <li>with Supabase for authentication, database, and session services;</li>
            <li>with Cloudflare R2 or related hosting infrastructure for uploaded avatar storage and delivery;</li>
            <li>with real-time infrastructure providers such as Pusher to deliver room and game updates;</li>
            <li>with other players in the same room, limited to gameplay information such as player name, avatar, and actions;</li>
            <li>when required by law, security needs, or to protect the rights and safety of users and the service.</li>
          </ul>
        </section>

        <section>
          <h2>5. Data Retention and Deletion</h2>
          <p>
            We keep personal information only for as long as reasonably necessary to provide the service, meet security
            needs, resolve disputes, or comply with legal obligations. Game room records and diagnostic logs may be
            retained for operational reliability and abuse prevention.
          </p>
          <p>
            You can remove uploaded avatars from the avatar picker when the feature is available in your account or game
            session. You can also request deletion of account-related personal information by contacting us at{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. Browser local storage can be cleared from your own
            browser settings.
          </p>
        </section>

        <section>
          <h2>6. Security</h2>
          <p>
            We use reasonable technical and organizational measures to protect user information. No online service can
            guarantee perfect security, but we work to limit access, use trusted infrastructure providers, and reduce
            the amount of information we collect.
          </p>
        </section>

        <section>
          <h2>7. Children</h2>
          <p>
            WePlayTogether is not directed to children under 13. If you believe a child has provided personal information
            without appropriate consent, contact us so we can review and delete it where required.
          </p>
        </section>

        <section>
          <h2>8. International Users</h2>
          <p>
            Your information may be processed in countries other than your own because our infrastructure providers may
            operate globally. We take steps intended to protect information consistently with this Privacy Policy.
          </p>
        </section>

        <section>
          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we make material changes, we will update the
            effective date on this page.
          </p>
        </section>

        <section>
          <h2>10. Contact</h2>
          <p>
            For privacy questions or data deletion requests, contact WePlayTogether at{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
        </section>

        <footer className={styles.footerLinks}>
          <Link href="/terms-of-service">Terms of Service</Link>
          <Link href="/">Return home</Link>
        </footer>
      </article>
    </main>
  );
}
