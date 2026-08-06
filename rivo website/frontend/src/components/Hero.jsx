import React from 'react';
import { Download } from 'lucide-react';

const Hero = () => {
  return (
    <header className="hero-section">
      <div className="hero-container">
        <div className="hero-info">
          <h1 className="hero-title">
            Your Private, <br />
            <span className="gradient-text">On-Device AI</span>
          </h1>
          <p className="hero-subtitle">
            Rivo Agent runs compact language models directly on your smartphone. Chat offline, keep secure local memory, and process intelligent reasoning without cloud API surveillance or network dependancy.
          </p>
          <div className="hero-actions">
            <a
              href="https://github.com/sanketpadhyal/Rivo-Agent-Application/releases/download/v2.1.0/rivo-agent-v2.1.0.apk"
              className="hero-primary-btn"
            >
              <Download size={20} strokeWidth={2.5} />
              <span>Download Android APK</span>
            </a>
          </div>
          <p className="hero-support-note">Designed for all Android phones, even 2 GB RAM devices.</p>
        </div>
      </div>
    </header>
  );
};

export default Hero;
