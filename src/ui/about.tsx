import { useLocale } from "./locale";
import { t } from "../shared/i18n";
import { useState } from "react";
import {
  IconBrandDiscord,
  IconBrandGithub,
  IconExternalLink,
  IconHeart,
  IconMail,
} from "@tabler/icons-react";

export function About() {
  useLocale();
  const [supportOpen, setSupportOpen] = useState(false);
  return (
    <div className="about">
      <section className="about-intro">
        <img src="./icons/128.png" width="80" height="80" alt="" />
        <div>
          <h2>{t("Bring your videos into focus.")}</h2>
          <p>
            {t("WebScaly brings out detail in the videos you watch, right in your browser. Spatial Detail sharpens and cleans any video, Anime4K is trained for animation, and FSRCNNX restores fine detail in camera footage. Compare the result whenever you like, while the website's player keeps playback and sound.")}</p>
        </div>
      </section>

      <section className="group">
        <header>
          <h2>{t("Your videos stay yours.")}</h2>
          <p>
            {t("Enhancement happens on your device. WebScaly does not send your videos to a server, track your browsing, or collect personal data.")}</p>
        </header>
        <ul className="privacy-points">
          <li>
            <strong>{t("You choose the websites.")}</strong>
            <span>
              {t("Access starts off. Approve only the sites you want, and remove access at any time.")}</span>
          </li>
          <li>
            <strong>{t("Your preferences stay local.")}</strong>
            <span>
              {t("Settings and approved sites are saved in your browser, without an account or cloud sync.")}</span>
          </li>
          <li>
            <strong>{t("No ads. No analytics.")}</strong>
            <span>
              {t("No tracking scripts, background uploads, or remote processing.")}</span>
          </li>
        </ul>
      </section>

      <div className="about-grid">
        <section className="group">
          <header>
            <h2>{t("Contact")}</h2>
            <p>{t("A question, an idea, or a little feedback?")}</p>
          </header>
          <div className="rows">
            <a
              className="contact-link"
              href="https://github.com/Lorcuz/WebScaly"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandGithub size={20} stroke={1.7} aria-hidden="true" />
              <span>
                <small>GitHub</small>Lorcuz/WebScaly
              </span>
              <IconExternalLink className="external-mark" size={16} stroke={1.7} aria-hidden="true" />
            </a>
            <a className="contact-link" href="mailto:notlorcuz@gmail.com">
              <IconMail size={20} stroke={1.7} aria-hidden="true" />
              <span>
                <small>{t("Email")}</small>notlorcuz@gmail.com
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
              <IconExternalLink className="external-mark" size={16} stroke={1.7} aria-hidden="true" />
            </a>
          </div>
        </section>
        <section className="group support">
          <header>
            <h2>{t("A little support goes a long way.")}</h2>
            <p>
              {t("Enjoying WebScaly? You can support its development with an optional PayPal donation. It is never required.")}</p>
          </header>
          <button
            className="btn"
            aria-expanded={supportOpen}
            aria-controls="support-qr"
            onClick={() => setSupportOpen(!supportOpen)}
          >
            <IconHeart size={18} stroke={1.7} aria-hidden="true" />
            {supportOpen ? t("Hide QR code") : t("Support WebScaly")}
          </button>
          <div id="support-qr" hidden={!supportOpen}>
            {supportOpen && (
              // Show only the QR region of the supplied image, without altering its pixels.
              <div
                className="qr-window"
                role="img"
                aria-label={t("PayPal donation QR code")}
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
        {t("GitHub, email, Discord and PayPal are optional third-party services with their own privacy policies.")}</p>
      <footer className="about-credit">
        <p>
          {t("Built in Italy")}{" "}
          <img
            className="italy-flag"
            src="./images/italy.svg"
            width="22"
            height="22"
            alt="🇮🇹"
          />
        </p>
        <small>{t("by Lorenzo Gresio")}</small>
      </footer>
    </div>
  );
}
