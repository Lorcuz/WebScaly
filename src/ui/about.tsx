import { useState } from "react";
import {
  IconBrandDiscord,
  IconHeart,
  IconMail,
  IconShieldCheck,
} from "@tabler/icons-react";

export function About() {
  const [supportOpen, setSupportOpen] = useState(false);
  return (
    <div className="about-page">
      <section className="settings-panel about-intro">
        <img src="./icons/128.png" width="72" height="72" alt="" />
        <div>
          <span className="about-version">WebScaly · 0.3.0</span>
          <h2>Bring your videos into focus.</h2>
          <p>
            WebScaly brings out detail in the videos you watch, right in your
            browser. Choose Spatial Detail for light sharpening, Anime4K for
            animation, or FSRCNNX for finer detail. Compare the result whenever
            you like, while your player keeps playback and sound.
          </p>
        </div>
      </section>

      <section className="settings-panel about-privacy">
        <div className="panel-heading">
          <IconShieldCheck size={22} stroke={1.7} aria-hidden="true" />
          <h2>Your videos stay yours.</h2>
        </div>
        <p className="muted">
          Enhancement happens on your device. WebScaly does not send your videos
          to a server, track your browsing, or collect personal data.
        </p>
        <ul className="privacy-points">
          <li>
            <strong>You choose the websites.</strong>
            <span>
              Access starts off. Approve only the sites you want, and remove
              access at any time.
            </span>
          </li>
          <li>
            <strong>Your preferences stay local.</strong>
            <span>
              Settings and approved sites are saved in your browser, without an
              account or cloud sync.
            </span>
          </li>
          <li>
            <strong>No ads. No analytics.</strong>
            <span>
              No tracking scripts, background uploads, or remote processing.
            </span>
          </li>
        </ul>
      </section>

      <div className="about-grid">
        <section className="settings-panel about-contact">
          <h2>Contact</h2>
          <p className="muted">A question, an idea, or a little feedback?</p>
          <a className="contact-link" href="mailto:notlorcuz@gmail.com">
            <IconMail size={20} stroke={1.7} aria-hidden="true" />
            <span>
              <small>Email</small>notlorcuz@gmail.com
            </span>
          </a>
          <a
            className="contact-link"
            href="https://discord.com/users/754255237195235369"
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconBrandDiscord size={20} stroke={1.7} aria-hidden="true" />
            <span>
              <small>Discord</small>Lorcuz
            </span>
            <span className="external-mark" aria-hidden="true">
              ↗
            </span>
          </a>
        </section>
        <section className="settings-panel about-support">
          <h2>A little support goes a long way.</h2>
          <p className="muted">
            Enjoying WebScaly? You can support its development with an optional
            PayPal donation.
          </p>
          <button
            className="support-button"
            aria-expanded={supportOpen}
            aria-controls="support-qr"
            onClick={() => setSupportOpen(!supportOpen)}
          >
            <IconHeart size={18} stroke={1.7} aria-hidden="true" />
            {supportOpen ? "Hide QR code" : "Support WebScaly"}
          </button>
          <div id="support-qr" hidden={!supportOpen}>
            {supportOpen && (
              // Show only the QR region of the supplied image, without altering its pixels.
              <div
                className="qr-window"
                role="img"
                aria-label="PayPal donation QR code"
              >
                <img
                  src="./images/support-paypal.png"
                  width="815"
                  height="911"
                  alt=""
                />
              </div>
            )}
          </div>
        </section>
      </div>
      <p className="about-external-note">
        Email, Discord and PayPal are optional third-party services with their
        own privacy policies.
      </p>
      <footer className="about-credit">
        <p>
          Built in Italy{" "}
          <img
            className="italy-flag"
            src="./images/italy.svg"
            width="22"
            height="22"
            alt="🇮🇹"
          />
        </p>
        <small>by Lorenzo Gresio</small>
      </footer>
    </div>
  );
}
