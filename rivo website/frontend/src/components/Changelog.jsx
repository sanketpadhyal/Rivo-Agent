import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Eye,
  FileCode2,
  GitMerge,
  Image,
  Layers,
  Lock,
  Sparkles,
  Tag,
  Zap,
} from 'lucide-react';

const highlights = [
  {
    icon: Eye,
    color: '#AF52DE',
    title: 'On-Device Vision Engine',
    desc: 'SmolVLM 256M Instruct runs 100% locally — OCR, image QA, and visual understanding with zero cloud contact.',
  },
  {
    icon: Camera,
    color: '#0A84FF',
    title: 'Camera & Gallery Attachments',
    desc: 'Attach photos directly from your device with live thumbnail previews and glassmorphic chat bubble cards.',
  },
  {
    icon: Layers,
    color: '#34C759',
    title: 'Two-Phase GGUF Downloader',
    desc: 'Seamlessly downloads multi-file packages (language GGUF + mmproj) with live combined size tracking.',
  },
  {
    icon: Zap,
    color: '#FF9F0A',
    title: '60 FPS Hardware-Accelerated Loader',
    desc: 'Custom native-driver animated dot sequence replaces legacy indicators for buttery-smooth loading.',
  },
];

const techUpdates = [
  { label: 'react-native-image-picker', version: '^8.2.1', desc: 'Native device photo access' },
  { label: 'VISION_MODEL_CATALOG', version: 'new schema', desc: 'Multimodal GGUF model packages' },
  { label: 'ModelFileModule.kt', version: 'expanded', desc: 'Android content URI bridge' },
  { label: 'App.tsx nav state machine', version: 'updated', desc: 'Vision downloading → chat transitions' },
];

const visionAssets = [
  {
    name: 'SmolVLM-256M-Instruct-Q8_0.gguf',
    size: '~175 MB',
    type: 'Language model',
  },
  {
    name: 'mmproj-SmolVLM-256M-Instruct-f16.gguf',
    size: '~190 MB',
    type: 'Multimodal projector',
  },
];

const Changelog = () => {
  const [open, setOpen] = useState(false);

  return (
    <section className="changelog-section" id="changelog">
      <div className="section-container">
        {/* Header */}
        <div className="changelog-header">
          <div className="changelog-title-row">
            <div className="changelog-release-badge">
              <Tag size={12} strokeWidth={2.5} />
              Latest Release
            </div>
            <span className="changelog-version-label">v3.0.0</span>
          </div>

          <h2 className="changelog-title">
            Rivo Agent <span className="gradient-text-purple">v3.0.0</span>
          </h2>
          <p className="changelog-subtitle">
            Multimodal Vision Engine &amp; Photo Analysis Update
          </p>

          <div className="changelog-meta-row">
            <span className="changelog-meta-tag">
              <GitMerge size={12} strokeWidth={2.5} />
              ef39045
            </span>
            <span className="changelog-meta-tag green">
              <Sparkles size={12} strokeWidth={2.5} />
              Major Release
            </span>
            <span className="changelog-meta-dot">Released 3 hours ago</span>
          </div>

          <p className="changelog-lead">
            Major feature release introducing On-Device Multimodal Vision Analysis, image attachments
            from camera/gallery, a two-phase sequential GGUF downloader, native Android content URI
            resolution, interactive Vision Inspector bottom sheets, and custom 60FPS
            hardware-accelerated loading animations.
          </p>
        </div>

        {/* Highlight cards */}
        <div className="changelog-highlights-grid">
          {highlights.map((h) => {
            const Icon = h.icon;
            return (
              <div className="changelog-highlight-card" key={h.title}>
                <div
                  className="changelog-highlight-icon"
                  style={{ background: `${h.color}18`, border: `1px solid ${h.color}30` }}
                >
                  <Icon size={20} strokeWidth={2} style={{ color: h.color }} />
                </div>
                <h3 className="changelog-highlight-title">{h.title}</h3>
                <p className="changelog-highlight-desc">{h.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Full changelog expandable */}
        <div className="changelog-expand-wrapper">
          <button
            className="changelog-expand-btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span>{open ? 'Collapse full changelog' : 'View full changelog'}</span>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {open && (
            <div className="changelog-body">
              {/* Vision Engine */}
              <div className="changelog-group">
                <div className="changelog-group-header purple">
                  <Eye size={16} strokeWidth={2.5} />
                  On-Device Multimodal Vision Engine (SmolVLM 256M Instruct)
                </div>
                <ul className="changelog-list">
                  <li>Added 100% private, local image understanding, OCR, and visual QA running directly on device using llama.cpp. No images ever leave your phone or touch any cloud servers.</li>
                  <li>Powered by Hugging Face's ultra-compact SmolVLM-256M-Instruct (Q8_0 + f16 mmproj), requiring only ~365 MB total storage and ~1 GB RAM for hyper-smooth performance on any mobile device.</li>
                </ul>
              </div>

              {/* Camera & Gallery */}
              <div className="changelog-group">
                <div className="changelog-group-header blue">
                  <Camera size={16} strokeWidth={2.5} />
                  Camera &amp; Gallery Photo Attachment Flow
                </div>
                <ul className="changelog-list">
                  <li>Integrated native photo picker with a new image attachment button inside the composer bar.</li>
                  <li>Live thumbnail attachment previews with 1-tap removal prior to sending.</li>
                  <li>Chat stream renders user messages as embedded image bubble cards with glassmorphic badges (SmolVLM Vision) and optional text prompts/captions.</li>
                </ul>
              </div>

              {/* Content URI Bridge */}
              <div className="changelog-group">
                <div className="changelog-group-header green">
                  <FileCode2 size={16} strokeWidth={2.5} />
                  Native Content URI Bridge (copyContentUriToCache)
                </div>
                <ul className="changelog-list">
                  <li>Expanded native Kotlin module (ModelFileModule.kt) to automatically intercept Android content:// URIs from system photo pickers and materialize them into the app cache (cache/vision-inputs/).</li>
                  <li>Resolves filesystem constraints for llama.cpp multimodal image loading without permissions crashes or memory errors.</li>
                  <li>Added READ_MEDIA_IMAGES and READ_MEDIA_VISUAL_USER_SELECTED permissions.</li>
                </ul>
              </div>

              {/* Downloader */}
              <div className="changelog-group">
                <div className="changelog-group-header orange">
                  <Download size={16} strokeWidth={2.5} />
                  Two-Phase Multi-File Downloader Engine
                </div>
                <ul className="changelog-list">
                  <li>Upgraded DownloadScreen engine to seamlessly download complex multi-file packages (main language GGUF + multimodal projector mmproj GGUF).</li>
                  <li>Automatically calculates total combined package sizes, handles Hugging Face HEAD request redirects, and displays live multi-stage download status ("Starting mmproj").</li>
                  <li>Supports pause/resume for all download phases.</li>
                </ul>
              </div>

              {/* Vision Inspector */}
              <div className="changelog-group">
                <div className="changelog-group-header purple">
                  <Eye size={16} strokeWidth={2.5} />
                  Interactive Vision Output Inspector
                </div>
                <ul className="changelog-list">
                  <li>Introduced a sleek frosted glass bottom sheet (visionSheetCard) allowing users to view, inspect, and copy raw vision model OCR text and detailed image breakdown outputs with a single tap.</li>
                </ul>
              </div>

              {/* 60FPS Loader */}
              <div className="changelog-group">
                <div className="changelog-group-header orange">
                  <Zap size={16} strokeWidth={2.5} />
                  Hardware-Accelerated 60FPS Loader
                </div>
                <ul className="changelog-list">
                  <li>Replaced legacy indicators with a custom lightweight Animated dot sequence (Loader.tsx) using native drivers for hyper-smooth 60FPS loading animations during image processing and setup.</li>
                </ul>
              </div>

              {/* UI & UX Polish */}
              <div className="changelog-group">
                <div className="changelog-group-header blue">
                  <Sparkles size={16} strokeWidth={2.5} />
                  UI &amp; UX Polish
                </div>
                <ul className="changelog-list">
                  <li><strong>Redesigned User Profile Drawer:</strong> Added vision model uninstall options, active connection indicators (green online status dot), and updated typography.</li>
                  <li><strong>Upgraded Professional Alerts:</strong> Integrated Lucide Eye vision icon for vision-related prompts and added boldSuffix formatting for clear alert messaging.</li>
                  <li><strong>Android Status Bar Gap Fixes:</strong> Improved dynamic header top inset calculations (Platform.OS === 'android') across Android devices.</li>
                  <li><strong>Refined Composer Input:</strong> Streamlined multiline input height (72px) and adjusted popover overlay stack ordering (zIndex: 100) for seamless keyboard interactions.</li>
                </ul>
              </div>

              {/* Technical Dependencies */}
              <div className="changelog-group">
                <div className="changelog-group-header green">
                  <Cpu size={16} strokeWidth={2.5} />
                  Technical &amp; Dependency Updates
                </div>
                <div className="changelog-deps-grid">
                  {techUpdates.map((t) => (
                    <div className="changelog-dep-row" key={t.label}>
                      <code className="changelog-dep-name">{t.label}</code>
                      <span className="changelog-dep-version">{t.version}</span>
                      <span className="changelog-dep-desc">{t.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assets */}
              <div className="changelog-group">
                <div className="changelog-group-header purple">
                  <Image size={16} strokeWidth={2.5} />
                  Assets &amp; Recommended Vision Model
                </div>
                <div className="changelog-assets-list">
                  {visionAssets.map((a) => (
                    <div className="changelog-asset-row" key={a.name}>
                      <div className="changelog-asset-name">
                        <code>{a.name}</code>
                      </div>
                      <div className="changelog-asset-meta">
                        <span className="changelog-asset-type">{a.type}</span>
                        <span className="changelog-asset-size">{a.size}</span>
                      </div>
                    </div>
                  ))}
                  <p className="changelog-total-size">
                    <strong>Total Package:</strong> ~365 MB · ~1 GB RAM required
                  </p>
                </div>

                {/* Privacy note */}
                <div className="changelog-privacy-note">
                  <Lock size={14} strokeWidth={2.5} style={{ color: '#34C759', flexShrink: 0 }} />
                  <p>
                    <strong>Privacy Assurance:</strong> All vision analysis and image reasoning run 100% locally on your device's NPU/CPU. Local AI models can make mistakes — please verify important visual information.
                  </p>
                </div>
              </div>

              {/* Full changelog link */}
              <div className="changelog-footer-link">
                <a
                  href="https://github.com/sanketpadhyal/Rivo-Agent-Application/releases/tag/v3.0.0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="changelog-github-link"
                >
                  <GitMerge size={14} strokeWidth={2.5} />
                  Full diff: v2.1.0...v3.0.0 on GitHub
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Download CTA */}
        <div className="changelog-cta">
          <a
            href="https://github.com/sanketpadhyal/Rivo-Agent-Application/releases/download/v3.0.0/rivo-agent-v3.apk"
            className="changelog-download-btn"
          >
            <Download size={18} strokeWidth={2.5} />
            Download v3.0.0 APK
          </a>
          <a
            href="https://github.com/sanketpadhyal/Rivo-Agent-Application/releases/tag/v3.0.0"
            className="changelog-release-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub →
          </a>
        </div>
      </div>
    </section>
  );
};

export default Changelog;
