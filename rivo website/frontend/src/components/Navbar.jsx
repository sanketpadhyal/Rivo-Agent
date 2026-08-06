import React from 'react';
import { Download } from 'lucide-react';

const Navbar = () => {
  const scrollToSection = (id) => {
    if (window.location.pathname === '/blog') {
      window.location.href = `/#${id}`;
      return;
    }

    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-logo" onClick={() => {
          if (window.location.pathname === '/blog') {
            window.location.href = '/';
            return;
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}>
          <img src="/logo.png" alt="Rivo logo" className="logo-img" />
          <span className="logo-text">Rivo Agent</span>
        </div>
        <div className="nav-links">
          <button onClick={() => scrollToSection('features')} className="nav-link-btn">Features</button>
          <button onClick={() => scrollToSection('models')} className="nav-link-btn">Models</button>
          <button onClick={() => scrollToSection('usage')} className="nav-link-btn">Usage</button>
          <a href="/blog" className="nav-link-anchor">Blog</a>
          <a
            href="https://github.com/sanketpadhyal/Rivo-Agent-Application/releases/download/v2.1.0/rivo-agent-v2.1.0.apk"
            className="nav-download-btn"
          >
            <Download size={16} strokeWidth={2.5} />
            <span className="nav-download-label-full">Download APK</span>
            <span className="nav-download-label-short">APK</span>
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
