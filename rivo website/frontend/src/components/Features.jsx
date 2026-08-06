import React from 'react';
import { MessageSquare, WifiOff, Settings, Lock, Sliders, BrainCircuit } from 'lucide-react';

const Features = () => {
  const featureList = [
    {
      Icon: Sliders,
      title: 'Inline Reasoning Controls',
      desc: 'Seamlessly expand reasoning effort levels (Light, Medium, High, Ultra) and Fast Chat mode with buttery 550ms animations inside the composer.'
    },
    {
      Icon: WifiOff,
      title: 'Runs 100% Offline',
      desc: 'No API keys, server delays, or network queries. Complete inference is handled directly on your local device CPU.'
    },
    {
      Icon: Lock,
      title: 'Zero Data Leaks',
      desc: 'Your chat history, preferences, user profile name, and assistant memories stay strictly stored inside secure local AsyncStorage.'
    },
    {
      Icon: BrainCircuit,
      title: 'Vector Category Badges',
      desc: 'Visual indicators map reasoning engines, coding experts, and direct chat models for instant hardware selection.'
    },
    {
      Icon: Settings,
      title: 'Neural Panel Tuning',
      desc: 'Customize the AI name, core personality parameters, emoji count, token limits, and sliding window context sizes.'
    },
    {
      Icon: MessageSquare,
      title: 'Fluid Streaming',
      desc: 'Buttery-smooth text streaming equipped with user-aware auto-scrolling, Markdown code rendering, and live thought timers.'
    }
  ];

  return (
    <section id="features" className="features-section">
      <div className="section-container">
        <div className="section-header">
          <h2 className="section-title">Engineered for On-Device Control</h2>
          <p className="section-subtitle">
            Experience advanced AI execution designed with total privacy, responsiveness, and control.
          </p>
        </div>
        <div className="features-grid">
          {featureList.map((feat, index) => {
            const Icon = feat.Icon;
            return (
              <div key={index} className="feature-card">
                <div className="feature-icon-wrapper">
                  <Icon size={24} strokeWidth={2.2} className="feature-icon" />
                </div>
                <h3 className="feature-card-title">{feat.title}</h3>
                <p className="feature-card-desc">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
