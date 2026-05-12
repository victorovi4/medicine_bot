"use client"

import { useEffect, useState } from "react"

const STYLES = `
  .lp-body {
    --lp-bg: #030b14;
    --lp-bg-2: #060f1c;
    --lp-surface: #0a1525;
    --lp-surface-2: #0e1b2e;
    --lp-border: rgba(0, 210, 170, 0.09);
    --lp-border-hover: rgba(0, 210, 170, 0.28);
    --lp-accent: #00d2aa;
    --lp-accent-bright: #00f0c6;
    --lp-accent-dim: rgba(0, 210, 170, 0.1);
    --lp-accent-glow: 0 0 32px rgba(0, 210, 170, 0.3);
    --lp-amber: #f5a623;
    --lp-amber-dim: rgba(245, 166, 35, 0.1);
    --lp-red-dim: rgba(255, 90, 80, 0.12);
    --lp-red: #ff5a50;
    --lp-green: #34d399;
    --lp-green-dim: rgba(52, 211, 153, 0.1);
    --lp-text: #cce8e1;
    --lp-text-dim: rgba(204, 232, 225, 0.55);
    --lp-text-muted: rgba(204, 232, 225, 0.28);
    --ff-display: var(--font-display, "Georgia, serif");
    --ff-body: var(--font-body, "system-ui, sans-serif");
    --ff-mono: var(--font-mono-custom, "monospace");

    font-family: var(--ff-body);
    color: var(--lp-text);
    background: var(--lp-bg);
    min-height: 100vh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    margin: 0;
  }

  .lp-body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0, 210, 170, 0.022) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 210, 170, 0.022) 1px, transparent 1px);
    background-size: 56px 56px;
    pointer-events: none;
    z-index: 0;
  }

  .lp-body > * { position: relative; z-index: 1; }

  @keyframes lp-fade-up {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes lp-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes lp-pulse-dot {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50%       { transform: scale(1.4); opacity: 0.4; }
  }
  @keyframes lp-ecg-draw {
    from { stroke-dashoffset: 2400; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes lp-ecg-march {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: -2400; }
  }
  @keyframes lp-shimmer {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes lp-float {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-7px); }
  }
  @keyframes lp-logo-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.7; }
  }

  /* REVEAL */
  .lp-reveal {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity 0.75s ease, transform 0.75s ease;
  }
  .lp-reveal.lp-visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* NAVBAR */
  .lp-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 200;
    padding: 18px 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background 0.35s, border-color 0.35s;
    border-bottom: 1px solid transparent;
  }
  .lp-nav.lp-scrolled {
    background: rgba(3, 11, 20, 0.9);
    backdrop-filter: blur(14px);
    border-color: var(--lp-border);
  }
  .lp-nav-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--ff-display);
    font-size: 21px;
    font-weight: 600;
    color: var(--lp-text);
    text-decoration: none;
    letter-spacing: -0.01em;
  }
  .lp-nav-links {
    display: flex; gap: 32px;
    list-style: none; margin: 0; padding: 0;
  }
  .lp-nav-links a {
    font-size: 14px;
    color: var(--lp-text-dim);
    text-decoration: none;
    transition: color 0.2s;
  }
  .lp-nav-links a:hover { color: var(--lp-accent); }
  @media (max-width: 720px) { .lp-nav-links { display: none; } .lp-nav { padding: 16px 24px; } }

  /* HERO */
  .lp-hero {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 120px 24px 100px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .lp-hero-glow {
    position: absolute;
    top: -10%; left: 50%;
    transform: translateX(-50%);
    width: 900px; height: 600px;
    background: radial-gradient(ellipse at center, rgba(0, 180, 150, 0.11) 0%, transparent 65%);
    pointer-events: none;
  }
  .lp-hero-glow-2 {
    position: absolute;
    bottom: 10%; right: -5%;
    width: 500px; height: 400px;
    background: radial-gradient(ellipse at center, rgba(0, 90, 180, 0.07) 0%, transparent 70%);
    pointer-events: none;
  }
  .lp-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 18px;
    border: 1px solid var(--lp-border-hover);
    border-radius: 999px;
    background: var(--lp-accent-dim);
    font-family: var(--ff-mono);
    font-size: 11.5px;
    letter-spacing: 0.06em;
    color: var(--lp-accent);
    margin-bottom: 36px;
    animation: lp-fade-in 0.8s ease 0.1s both;
  }
  .lp-badge-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--lp-accent);
    animation: lp-pulse-dot 2s ease infinite;
  }
  .lp-h1 {
    font-family: var(--ff-display);
    font-size: clamp(48px, 7.5vw, 94px);
    font-weight: 700;
    line-height: 1.04;
    letter-spacing: -0.025em;
    margin-bottom: 24px;
    color: var(--lp-text);
    animation: lp-fade-up 0.9s ease 0.25s both;
  }
  .lp-h1-italic {
    font-style: italic;
    background: linear-gradient(135deg, var(--lp-accent) 0%, #00a8ff 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: lp-shimmer 4s linear infinite;
  }
  .lp-hero-sub {
    font-size: clamp(16px, 2.2vw, 19px);
    color: var(--lp-text-dim);
    max-width: 560px;
    line-height: 1.72;
    margin-bottom: 52px;
    font-weight: 300;
    animation: lp-fade-up 0.9s ease 0.42s both;
  }
  .lp-cta-row {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    animation: lp-fade-up 0.9s ease 0.58s both;
  }
  .lp-btn-primary {
    padding: 15px 34px;
    background: var(--lp-accent);
    color: #030b14;
    font-family: var(--ff-body);
    font-size: 15px;
    font-weight: 600;
    border-radius: 9px;
    border: none;
    cursor: pointer;
    transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
    text-decoration: none;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .lp-btn-primary:hover {
    background: var(--lp-accent-bright);
    transform: translateY(-2px);
    box-shadow: var(--lp-accent-glow);
  }
  .lp-btn-secondary {
    padding: 15px 28px;
    background: transparent;
    color: var(--lp-text-dim);
    font-family: var(--ff-body);
    font-size: 15px;
    font-weight: 400;
    border-radius: 9px;
    border: 1px solid var(--lp-border);
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .lp-btn-secondary:hover {
    border-color: var(--lp-border-hover);
    color: var(--lp-text);
    background: var(--lp-accent-dim);
  }
  .lp-ecg-wrap {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 90px;
    overflow: hidden;
    pointer-events: none;
  }
  .lp-ecg-path {
    stroke-dasharray: 2400;
    animation: lp-ecg-draw 2.8s ease 0.9s forwards, lp-ecg-march 9s linear 3.8s infinite;
  }

  /* STATS */
  .lp-stats-wrap { border-top: 1px solid var(--lp-border); border-bottom: 1px solid var(--lp-border); }
  .lp-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    background: var(--lp-border);
    gap: 1px;
  }
  @media (max-width: 700px) { .lp-stats { grid-template-columns: repeat(2, 1fr); } }
  .lp-stat {
    padding: 40px 24px;
    background: var(--lp-bg);
    text-align: center;
  }
  .lp-stat-num {
    font-family: var(--ff-display);
    font-size: 50px;
    font-weight: 700;
    color: var(--lp-accent);
    line-height: 1;
    margin-bottom: 8px;
    letter-spacing: -0.02em;
  }
  .lp-stat-num sup { font-size: 22px; vertical-align: super; }
  .lp-stat-label {
    font-size: 12px;
    color: var(--lp-text-muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-family: var(--ff-mono);
  }

  /* SECTION COMMON */
  .lp-section { padding: 108px 24px; max-width: 1200px; margin: 0 auto; }
  .lp-section-label {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--lp-accent);
    margin-bottom: 18px;
    display: flex; align-items: center; gap: 14px;
  }
  .lp-section-label::after {
    content: '';
    flex: 0 0 36px; height: 1px;
    background: var(--lp-accent); opacity: 0.45;
  }
  .lp-section-h2 {
    font-family: var(--ff-display);
    font-size: clamp(34px, 4.5vw, 58px);
    font-weight: 700;
    line-height: 1.08;
    letter-spacing: -0.022em;
    margin-bottom: 18px;
    color: var(--lp-text);
  }
  .lp-section-h2 em { font-style: italic; color: var(--lp-accent); }
  .lp-section-desc {
    font-size: 17px;
    color: var(--lp-text-dim);
    max-width: 520px;
    line-height: 1.72;
    margin-bottom: 60px;
    font-weight: 300;
  }

  /* FEATURES GRID */
  .lp-features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--lp-border);
    border: 1px solid var(--lp-border);
    border-radius: 18px;
    overflow: hidden;
  }
  @media (max-width: 860px) { .lp-features-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 540px) { .lp-features-grid { grid-template-columns: 1fr; } }
  .lp-feature-card {
    padding: 42px 36px;
    background: var(--lp-bg-2);
    transition: background 0.3s;
    position: relative;
    overflow: hidden;
  }
  .lp-feature-card::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--lp-accent), transparent);
    opacity: 0;
    transition: opacity 0.35s;
  }
  .lp-feature-card:hover { background: var(--lp-surface); }
  .lp-feature-card:hover::after { opacity: 1; }
  .lp-feature-card.lp-feature-highlight { background: var(--lp-surface); }
  .lp-feature-card.lp-feature-highlight::after { opacity: 0.5; }
  .lp-feature-icon { font-size: 30px; margin-bottom: 20px; display: block; }
  .lp-feature-title { font-size: 17px; font-weight: 600; margin-bottom: 11px; color: var(--lp-text); }
  .lp-feature-desc { font-size: 14px; color: var(--lp-text-dim); line-height: 1.68; font-weight: 300; }

  /* HOW IT WORKS */
  .lp-steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 40px;
    position: relative;
  }
  @media (max-width: 720px) { .lp-steps { grid-template-columns: 1fr; gap: 32px; } }
  .lp-step-connector {
    position: absolute;
    top: 23px;
    left: calc(33.33% - 8px);
    right: calc(33.33% - 8px);
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, var(--lp-border-hover) 30%, var(--lp-border-hover) 70%, transparent 100%);
  }
  @media (max-width: 720px) { .lp-step-connector { display: none; } }
  .lp-step-dot-wrap {
    width: 46px; height: 46px;
    border-radius: 50%;
    border: 2px solid var(--lp-border-hover);
    background: var(--lp-surface);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 22px;
    position: relative; z-index: 1;
  }
  .lp-step-dot-inner { width: 12px; height: 12px; border-radius: 50%; background: var(--lp-accent); }
  .lp-step-num-label {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--lp-accent);
    letter-spacing: 0.1em;
    margin-bottom: 8px;
    opacity: 0.7;
  }
  .lp-step-title { font-size: 19px; font-weight: 600; margin-bottom: 10px; color: var(--lp-text); }
  .lp-step-desc { font-size: 14px; color: var(--lp-text-dim); line-height: 1.68; font-weight: 300; }

  /* CHAT SECTION */
  .chat-mock {
    background: var(--lp-surface-2);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    padding: 22px;
    animation: lp-float 5s ease infinite;
  }
  .chat-mock-header {
    display: flex; align-items: center; gap: 11px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--lp-border);
    margin-bottom: 18px;
  }
  .chat-mock-avatar {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: linear-gradient(135deg, #00d2aa 0%, #0066cc 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 19px;
  }
  .chat-mock-name { font-size: 14px; font-weight: 600; color: var(--lp-text); }
  .chat-mock-status { font-size: 11px; color: var(--lp-accent); font-family: var(--ff-mono); }
  .chat-msg { margin-bottom: 11px; }
  .chat-msg-user { text-align: right; }
  .chat-bubble {
    display: inline-block;
    padding: 10px 15px;
    border-radius: 12px;
    font-size: 13px; line-height: 1.52;
    max-width: 88%;
  }
  .chat-bubble-bot { background: var(--lp-surface); border: 1px solid var(--lp-border); color: var(--lp-text); border-bottom-left-radius: 4px; }
  .chat-bubble-user { background: var(--lp-accent); color: #030b14; font-weight: 500; border-bottom-right-radius: 4px; }

  /* SPLIT LAYOUT */
  .lp-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 72px;
    align-items: center;
  }
  @media (max-width: 780px) { .lp-split { grid-template-columns: 1fr; gap: 36px; } }
  .lp-check-list { display: flex; flex-direction: column; gap: 13px; margin-top: 28px; }
  .lp-check-item {
    display: flex; align-items: flex-start; gap: 12px;
    font-size: 14px; color: var(--lp-text-dim); font-weight: 300; line-height: 1.5;
  }
  .lp-check-mark { color: var(--lp-accent); font-family: var(--ff-mono); font-size: 13px; margin-top: 1px; flex-shrink: 0; }

  /* TELEGRAM */
  .lp-tg-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 72px;
    align-items: center;
    padding: 60px;
    background: var(--lp-surface);
    border: 1px solid var(--lp-border);
    border-radius: 20px;
    position: relative;
    overflow: hidden;
  }
  .lp-tg-split::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(ellipse 50% 80% at 100% 50%, rgba(0, 100, 200, 0.07) 0%, transparent 65%);
    pointer-events: none;
  }
  @media (max-width: 780px) { .lp-tg-split { grid-template-columns: 1fr; padding: 36px; gap: 32px; } }
  .lp-tg-cmds { display: flex; flex-direction: column; gap: 8px; }
  .lp-tg-cmd {
    display: flex; align-items: center; gap: 14px;
    padding: 13px 16px;
    background: var(--lp-surface-2);
    border: 1px solid var(--lp-border);
    border-radius: 9px;
    transition: border-color 0.2s;
  }
  .lp-tg-cmd:hover { border-color: var(--lp-border-hover); }
  .lp-tg-cmd-name { font-family: var(--ff-mono); font-size: 13px; color: var(--lp-accent); min-width: 100px; }
  .lp-tg-cmd-desc { font-size: 13px; color: var(--lp-text-dim); font-weight: 300; }

  /* ASSESSMENT */
  .assessment-card {
    background: var(--lp-surface-2);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    overflow: hidden;
  }
  .assessment-card-header {
    padding: 16px 20px;
    background: var(--lp-surface);
    border-bottom: 1px solid var(--lp-border);
    display: flex; justify-content: space-between; align-items: center;
  }
  .assessment-card-title { font-family: var(--ff-mono); font-size: 11px; color: var(--lp-accent); letter-spacing: 0.1em; text-transform: uppercase; }
  .assessment-card-date { font-family: var(--ff-mono); font-size: 11px; color: var(--lp-text-muted); }
  .assessment-row {
    display: flex; align-items: flex-start; gap: 14px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--lp-border);
  }
  .assessment-row:last-child { border-bottom: none; }
  .assessment-row-icon { font-size: 17px; line-height: 1.45; flex-shrink: 0; }
  .assessment-row-label { font-family: var(--ff-mono); font-size: 10.5px; color: var(--lp-text-muted); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px; }
  .assessment-row-text { font-size: 13px; color: var(--lp-text-dim); line-height: 1.5; font-weight: 300; }

  /* CLINICAL RECS */
  .lp-clinrec-card {
    background: var(--lp-surface-2);
    border: 1px solid var(--lp-border);
    border-radius: 14px;
    overflow: hidden;
  }
  .lp-clinrec-header {
    padding: 16px 20px;
    background: var(--lp-surface);
    border-bottom: 1px solid var(--lp-border);
    display: flex; justify-content: space-between; align-items: center;
  }
  .lp-clinrec-title { font-family: var(--ff-mono); font-size: 11px; color: var(--lp-accent); letter-spacing: 0.1em; text-transform: uppercase; }
  .lp-clinrec-subtitle { font-family: var(--ff-mono); font-size: 11px; color: var(--lp-text-muted); }
  .lp-clinrec-row {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--lp-border);
  }
  .lp-clinrec-row:last-child { border-bottom: none; }
  .lp-clinrec-status {
    width: 20px; height: 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; flex-shrink: 0;
  }
  .lp-clinrec-status.ok { background: var(--lp-green-dim); color: var(--lp-green); }
  .lp-clinrec-status.warn { background: var(--lp-amber-dim); color: var(--lp-amber); }
  .lp-clinrec-status.err { background: var(--lp-red-dim); color: var(--lp-red); }
  .lp-clinrec-text { font-size: 13px; color: var(--lp-text-dim); font-weight: 300; line-height: 1.4; }
  .lp-clinrec-text strong { color: var(--lp-text); font-weight: 500; }
  .lp-clinrec-footer {
    padding: 14px 20px;
    background: var(--lp-surface);
    border-top: 1px solid var(--lp-border);
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--lp-text-muted);
    display: flex; justify-content: space-between;
  }
  .lp-clinrec-score { color: var(--lp-amber); font-weight: 500; }

  /* TAGS */
  .lp-tag {
    display: inline-flex; align-items: center;
    padding: 4px 13px;
    border-radius: 999px;
    font-size: 12px;
    font-family: var(--ff-mono);
    border: 1px solid;
  }
  .lp-tag-teal { border-color: rgba(0,210,170,0.35); color: var(--lp-accent); background: var(--lp-accent-dim); }
  .lp-tag-amber { border-color: rgba(245,166,35,0.35); color: var(--lp-amber); background: var(--lp-amber-dim); }

  /* ARROW LIST */
  .lp-arrow-list { display: flex; flex-direction: column; gap: 11px; }
  .lp-arrow-item {
    display: flex; align-items: flex-start; gap: 11px;
    font-size: 14px; color: var(--lp-text-dim); font-weight: 300; line-height: 1.5;
  }
  .lp-arrow-sym { color: var(--lp-accent); font-family: var(--ff-mono); font-size: 13px; margin-top: 1px; flex-shrink: 0; }

  /* CONTACT */
  .lp-contact-block {
    margin-top: 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .lp-contact-label {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--lp-text-muted);
    margin-bottom: 4px;
  }
  .lp-contact-links {
    display: flex;
    gap: 0;
    align-items: center;
  }
  .lp-contact-link {
    font-size: 15px;
    font-weight: 500;
    color: var(--lp-accent);
    text-decoration: none;
    transition: color 0.2s;
    letter-spacing: -0.01em;
  }
  .lp-contact-link:hover { color: var(--lp-accent-bright); }
  .lp-contact-sep {
    margin: 0 16px;
    color: var(--lp-border-hover);
    font-family: var(--ff-mono);
    font-size: 13px;
  }

  /* CTA */
  .lp-cta-wrap {
    text-align: center;
    padding: 128px 24px;
    position: relative;
    overflow: hidden;
  }
  .lp-cta-wrap::before {
    content: '';
    position: absolute;
    bottom: 0; left: 50%;
    transform: translateX(-50%);
    width: 800px; height: 500px;
    background: radial-gradient(ellipse at center bottom, rgba(0, 210, 170, 0.08) 0%, transparent 65%);
    pointer-events: none;
  }

  /* FOOTER */
  .lp-footer {
    border-top: 1px solid var(--lp-border);
    padding: 28px 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--lp-text-muted);
  }
  @media (max-width: 600px) { .lp-footer { flex-direction: column; gap: 8px; text-align: center; } }
  .lp-footer-brand {
    display: flex; align-items: center; gap: 8px;
    color: var(--lp-text-muted); text-decoration: none;
  }
`

function TelegramLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/telegram-logo.png"
      alt="Telegram"
      width={size}
      height={size}
      style={{ borderRadius: "50%", display: "block" }}
    />
  )
}

function MedCardLogo({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Card body */}
      <rect x="3" y="5" width="28" height="24" rx="5" fill="url(#logo-grad)" />
      {/* ECG pulse line */}
      <path
        d="M6,19 L11,19 L13,13 L15.5,24 L18,8 L20.5,19 L28,19"
        stroke="rgba(3,11,20,0.85)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Top bar accent */}
      <rect x="3" y="5" width="28" height="4" rx="5" fill="rgba(0,0,0,0.18)" />
      <defs>
        <linearGradient id="logo-grad" x1="3" y1="5" x2="31" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00d2aa" />
          <stop offset="100%" stopColor="#0088cc" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const FEATURES = [
  {
    icon: "🔬",
    title: "AI-анализ документов",
    desc: "Загружайте PDF и фото — ИИ автоматически извлекает результаты, нормы, отклонения, дату и тип документа. Работает с рукописными и печатными текстами.",
  },
  {
    icon: "💬",
    title: "Чат «Доктор Хаус»",
    desc: "ИИ-консультант с полной историей болезни в контексте. Конкретные ответы, а не общие советы — анализирует именно ваши данные и динамику показателей.",
  },
  {
    icon: "📱",
    title: "Telegram-бот",
    desc: "Сфотографировали анализ в поликлинике — сразу отправили в бот. Несколько фото автоматически склеиваются в PDF и анализируются как один документ.",
  },
  {
    icon: "📊",
    title: "Метрики и тренды",
    desc: "Графики динамики ключевых показателей: ПСА, гемоглобин, глюкоза, давление. Референсные нормы и маркеры дат процедур прямо на графике.",
  },
  {
    icon: "🏥",
    title: "ИИ-заключение",
    desc: "Комплексный анализ всей медкарты по 6 секциям: хронология, статус, тренды, проблемы, риски, рекомендации. Запускается по требованию, результат сохраняется.",
  },
  {
    icon: "📋",
    title: "Выписка 027/у",
    desc: "Автоматическая генерация выписки по официальной форме из всех документов карты одной кнопкой — для предоставления по месту требования.",
  },
]

const TG_COMMANDS = [
  { cmd: "/start", desc: "Приветствие и инструкции" },
  { cmd: "/status", desc: "Статистика медкарты" },
  { cmd: "/last", desc: "Последние 5 документов" },
  { cmd: "/help", desc: "Справка по командам" },
  { cmd: "📎 Фото/PDF", desc: "Автоматический AI-анализ и добавление" },
]

const ASSESSMENT_ROWS = [
  { icon: "📅", label: "Хронология", text: "Наблюдение с 01.2021. 34 документа, 3 курса лечения, 12 консультаций." },
  { icon: "📈", label: "Тренды", text: "ПСА ↓ 68% за последние 6 мес. Гемоглобин в норме (стабильно)." },
  { icon: "⚠️", label: "Проблемы", text: "2 показателя вне референса. ПСА требует контроля через 4 нед." },
  { icon: "💊", label: "Рекомендации", text: "Консультация уролога. Продолжение текущей схемы лечения." },
]

const CLINREC_ROWS = [
  { status: "ok",   text: <><strong>Диагностика C61</strong> — перечень обязательных исследований выполнен</> },
  { status: "ok",   text: <><strong>Мониторинг ПСА</strong> — частота контроля соответствует стандарту</> },
  { status: "warn", text: <><strong>Контроль тестостерона</strong> — последнее измерение 4 мес. назад</> },
  { status: "err",  text: <><strong>Денситометрия</strong> — не проводилась при длительной АДТ</> },
  { status: "ok",   text: <><strong>Оценка сердечно-сосудистого риска</strong> — документирована</> },
]

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("lp-visible") }),
      { threshold: 0.12 }
    )
    document.querySelectorAll(".lp-reveal").forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <style>{STYLES}</style>
      <div className="lp-body">

        {/* ── NAV ─────────────────────────────────────────── */}
        <nav className={`lp-nav ${scrolled ? "lp-scrolled" : ""}`}>
          <a href="#top" className="lp-nav-brand">
            <MedCardLogo size={34} />
            МедКарта
          </a>
          <ul className="lp-nav-links">
            <li><a href="#features">Возможности</a></li>
            <li><a href="#how">Как работает</a></li>
            <li><a href="#chat">ИИ-чат</a></li>
            <li><a href="#clinrec">Клин. рекомендации</a></li>
          </ul>
        </nav>

        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="lp-hero" id="top">
          <div className="lp-hero-glow" />
          <div className="lp-hero-glow-2" />

          <div className="lp-badge">
            <span className="lp-badge-dot" />
            ИИ-анализ документов · Telegram-бот · Приватность
          </div>

          <h1 className="lp-h1">
            Персональная<br />
            медицинская карта<br />
            с{" "}
            <span className="lp-h1-italic">интеллектом ИИ</span>
          </h1>

          <p className="lp-hero-sub">
            Загружайте документы через Telegram или браузер —
            ИИ распознаёт, структурирует и анализирует. Чат с&nbsp;«Доктором
            Хаусом», который знает всю вашу историю болезни.
          </p>

          <div className="lp-cta-row">
            <a href="#features" className="lp-btn-primary">
              Узнать подробнее →
            </a>
            <a href="#how" className="lp-btn-secondary">
              Как это работает
            </a>
          </div>

          <div className="lp-ecg-wrap">
            <svg viewBox="0 0 1200 90" width="100%" height="90" fill="none" preserveAspectRatio="none">
              <path
                className="lp-ecg-path"
                d={[
                  "M0,45",
                  "L80,45 L86,42 L91,48 L94,14 L97,66 L100,45 L140,45",
                  "L220,45 L226,42 L231,48 L234,14 L237,66 L240,45 L280,45",
                  "L360,45 L366,42 L371,48 L374,14 L377,66 L380,45 L420,45",
                  "L500,45 L506,42 L511,48 L514,14 L517,66 L520,45 L560,45",
                  "L640,45 L646,42 L651,48 L654,14 L657,66 L660,45 L700,45",
                  "L780,45 L786,42 L791,48 L794,14 L797,66 L800,45 L840,45",
                  "L920,45 L926,42 L931,48 L934,14 L937,66 L940,45 L980,45",
                  "L1060,45 L1066,42 L1071,48 L1074,14 L1077,66 L1080,45 L1120,45",
                  "L1200,45",
                ].join(" ")}
                stroke="#00d2aa"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.45"
              />
            </svg>
          </div>
        </section>

        {/* ── STATS ────────────────────────────────────────── */}
        <div className="lp-stats-wrap lp-reveal">
          <div className="lp-stats">
            {[
              { num: "10", sup: "с", label: "Анализ документа" },
              { num: "∞", label: "История болезни" },
              { num: "6", label: "Типов документов" },
              { num: "0", label: "Утечек данных" },
            ].map((s, i) => (
              <div key={i} className="lp-stat">
                <div className="lp-stat-num">{s.num}{s.sup && <sup>{s.sup}</sup>}</div>
                <div className="lp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FEATURES ─────────────────────────────────────── */}
        <div id="features" style={{ background: "var(--lp-bg-2)", borderBottom: "1px solid var(--lp-border)" }}>
          <div className="lp-section">
            <div className="lp-section-label lp-reveal">01 — Возможности</div>
            <h2 className="lp-section-h2 lp-reveal">
              Всё, что нужно для<br />
              <em>умной медкарты</em>
            </h2>
            <p className="lp-section-desc lp-reveal">
              Один инстанс — один пациент. Ваши данные изолированы
              и&nbsp;доступны только вам.
            </p>
            <div className="lp-features-grid lp-reveal">
              {FEATURES.map((f, i) => (
                <div key={i} className="lp-feature-card">
                  <span className="lp-feature-icon">{f.icon}</span>
                  <div className="lp-feature-title">{f.title}</div>
                  <div className="lp-feature-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── HOW IT WORKS ─────────────────────────────────── */}
        <div id="how" style={{ background: "var(--lp-bg)" }}>
          <div className="lp-section">
            <div className="lp-section-label lp-reveal">02 — Как работает</div>
            <h2 className="lp-section-h2 lp-reveal">
              Три шага до<br />
              <em>полной картины здоровья</em>
            </h2>
            <p className="lp-section-desc lp-reveal">
              Никаких сложных настроек. Загружаете — ИИ делает остальное.
            </p>

            <div className="lp-steps lp-reveal">
              <div className="lp-step-connector" />
              {[
                {
                  n: "01",
                  title: "Загрузите документ",
                  desc: "Через сайт или Telegram-бот — фото, PDF или скан любого документа: анализа, УЗИ, консультации, выписки.",
                },
                {
                  n: "02",
                  title: "ИИ анализирует",
                  desc: "Автоматически распознаёт текст, извлекает показатели с референсными нормами, определяет тип документа и находит отклонения.",
                },
                {
                  n: "03",
                  title: "Понимайте здоровье",
                  desc: "Таймлайн событий, графики динамики, ИИ-чат и заключение — вся история болезни в одном месте.",
                },
              ].map((s, i) => (
                <div key={i}>
                  <div className="lp-step-dot-wrap"><div className="lp-step-dot-inner" /></div>
                  <div className="lp-step-num-label">ШАГ {s.n}</div>
                  <div className="lp-step-title">{s.title}</div>
                  <div className="lp-step-desc">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CHAT ─────────────────────────────────────────── */}
        <div id="chat" style={{ background: "var(--lp-bg-2)", borderTop: "1px solid var(--lp-border)", borderBottom: "1px solid var(--lp-border)" }}>
          <div className="lp-section">
            <div className="lp-section-label lp-reveal">03 — ИИ-чат</div>
            <div className="lp-split lp-reveal">
              <div>
                <h2 className="lp-section-h2" style={{ marginBottom: 16 }}>
                  <em>Доктор Хаус</em><br />
                  знает всё о вас
                </h2>
                <p style={{ fontSize: 16, color: "var(--lp-text-dim)", lineHeight: 1.72, fontWeight: 300 }}>
                  В отличие от обычных чат-ботов, наш ИИ загружает полную
                  историю болезни в контекст — все документы, показатели,
                  лечение. Он не даёт общих советов — анализирует конкретно
                  ваш случай.
                </p>
                <div className="lp-check-list">
                  {[
                    "Полная история болезни (все документы) в контексте",
                    "Ответы в реальном времени по мере генерации",
                    "Понимает медицинские термины и аббревиатуры",
                    "Учитывает диагнозы, лечение, процедуры и показатели",
                  ].map((f, i) => (
                    <div key={i} className="lp-check-item">
                      <span className="lp-check-mark">✓</span>{f}
                    </div>
                  ))}
                </div>
              </div>

              <div className="chat-mock">
                <div className="chat-mock-header">
                  <div className="chat-mock-avatar">🩺</div>
                  <div>
                    <div className="chat-mock-name">Доктор Хаус</div>
                    <div className="chat-mock-status">● онлайн · ИИ-консультант</div>
                  </div>
                </div>
                <div className="chat-msg chat-msg-user">
                  <div className="chat-bubble chat-bubble-user">Почему ПСА вырос в апреле?</div>
                </div>
                <div className="chat-msg">
                  <div className="chat-bubble chat-bubble-bot">
                    По вашим данным: ПСА 4.2 нг/мл (март) → 6.8 нг/мл (апрель).
                    Рост 62%. Коррелирует с прерыванием курса Золадекса
                    в марте — согласно вашей выписке от 15.03.
                  </div>
                </div>
                <div className="chat-msg chat-msg-user">
                  <div className="chat-bubble chat-bubble-user">Нужно ли беспокоиться?</div>
                </div>
                <div className="chat-msg">
                  <div className="chat-bubble chat-bubble-bot">
                    Значение выше референса (0–4 нг/мл), но динамика
                    соответствует прерыванию терапии. Рекомендую контроль
                    через 4 нед. и консультацию уролога.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── TELEGRAM ─────────────────────────────────────── */}
        <div id="telegram" style={{ background: "var(--lp-bg)" }}>
          <div className="lp-section">
            <div className="lp-section-label lp-reveal">04 — Telegram</div>
            <div className="lp-tg-split lp-reveal">
              <div style={{ position: "relative", zIndex: 1 }}>
                <h2 className="lp-section-h2" style={{ marginBottom: 16 }}>
                  Добавляйте документы<br />
                  прямо из <em>мессенджера</em>
                </h2>
                <p style={{ fontSize: 16, color: "var(--lp-text-dim)", lineHeight: 1.72, fontWeight: 300, marginBottom: 24 }}>
                  Сфотографировали анализ в поликлинике — сразу отправили в бот.
                  Без компьютера, без авторизации. Пакетная отправка нескольких
                  снимков автоматически создаёт единый PDF.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="lp-tag lp-tag-teal">Фото</span>
                  <span className="lp-tag lp-tag-teal">PDF</span>
                  <span className="lp-tag lp-tag-teal">Пакетная отправка</span>
                  <span className="lp-tag lp-tag-amber">Обнаружение дубликатов</span>
                </div>
              </div>
              <div className="lp-tg-cmds" style={{ position: "relative", zIndex: 1 }}>
                {TG_COMMANDS.map((c, i) => (
                  <div key={i} className="lp-tg-cmd">
                    <span className="lp-tg-cmd-name">{c.cmd}</span>
                    <span className="lp-tg-cmd-desc">{c.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── ASSESSMENT ───────────────────────────────────── */}
        <div style={{ background: "var(--lp-bg-2)", borderTop: "1px solid var(--lp-border)", borderBottom: "1px solid var(--lp-border)" }}>
          <div className="lp-section">
            <div className="lp-section-label lp-reveal">05 — ИИ-заключение</div>
            <div className="lp-split lp-reveal">
              <div className="assessment-card">
                <div className="assessment-card-header">
                  <span className="assessment-card-title">ИИ-заключение</span>
                  <span className="assessment-card-date">07.05.2025</span>
                </div>
                {ASSESSMENT_ROWS.map((r, i) => (
                  <div key={i} className="assessment-row">
                    <span className="assessment-row-icon">{r.icon}</span>
                    <div>
                      <div className="assessment-row-label">{r.label}</div>
                      <div className="assessment-row-text">{r.text}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <h2 className="lp-section-h2" style={{ marginBottom: 16 }}>
                  Полная картина<br />
                  <em>в одном отчёте</em>
                </h2>
                <p style={{ fontSize: 16, color: "var(--lp-text-dim)", lineHeight: 1.72, fontWeight: 300, marginBottom: 24 }}>
                  ИИ-заключение анализирует всю медкарту целиком — документы,
                  измерения, лечение, процедуры. Формирует структурированный
                  отчёт по 6 секциям с глубоким рассуждением.
                </p>
                <div className="lp-arrow-list">
                  {[
                    "Хронология всех медицинских событий",
                    "Текущий статус и динамика показателей",
                    "Выявленные проблемы и факторы риска",
                    "Конкретные рекомендации по дальнейшему лечению",
                  ].map((f, i) => (
                    <div key={i} className="lp-arrow-item">
                      <span className="lp-arrow-sym">→</span>{f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── CLINICAL RECOMMENDATIONS ─────────────────────── */}
        <div id="clinrec" style={{ background: "var(--lp-bg)" }}>
          <div className="lp-section">
            <div className="lp-section-label lp-reveal">06 — Клинические рекомендации</div>
            <div className="lp-split lp-reveal">
              <div>
                <h2 className="lp-section-h2" style={{ marginBottom: 16 }}>
                  Соответствие<br />
                  <em>клин. рекомендациям МЗ</em>
                </h2>
                <p style={{ fontSize: 16, color: "var(--lp-text-dim)", lineHeight: 1.72, fontWeight: 300, marginBottom: 24 }}>
                  ИИ сверяет медкарту с официальными клиническими
                  рекомендациями Минздрава РФ. Находит пробелы в документации
                  до того, как их обнаружит страховая компания.
                </p>
                <div className="lp-arrow-list" style={{ marginBottom: 28 }}>
                  {[
                    "Проверка полноты обследований по диагнозу (МКБ-10)",
                    "Контроль частоты мониторинга ключевых показателей",
                    "Выявление обязательных процедур, которые ещё не выполнены",
                    "Снижение риска страховых санкций для медорганизаций",
                  ].map((f, i) => (
                    <div key={i} className="lp-arrow-item">
                      <span className="lp-arrow-sym">→</span>{f}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="lp-tag lp-tag-teal">МКБ-10</span>
                  <span className="lp-tag lp-tag-teal">КР Минздрав РФ</span>
                  <span className="lp-tag lp-tag-amber">Страховой аудит</span>
                </div>
              </div>

              <div className="lp-clinrec-card">
                <div className="lp-clinrec-header">
                  <span className="lp-clinrec-title">Проверка КР · C61</span>
                  <span className="lp-clinrec-subtitle">РПЖ · 5 пунктов</span>
                </div>
                {CLINREC_ROWS.map((r, i) => (
                  <div key={i} className="lp-clinrec-row">
                    <div className={`lp-clinrec-status ${r.status}`}>
                      {r.status === "ok" ? "✓" : r.status === "warn" ? "!" : "✕"}
                    </div>
                    <div className="lp-clinrec-text">{r.text}</div>
                  </div>
                ))}
                <div className="lp-clinrec-footer">
                  <span>2 замечания требуют внимания</span>
                  <span className="lp-clinrec-score">Соответствие: 60%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ──────────────────────────────────────────── */}
        <div className="lp-cta-wrap">
          <div className="lp-badge lp-reveal" style={{ marginBottom: 28, display: "inline-flex" }}>
            <span className="lp-badge-dot" />
            Персональная ЭМК · Telegram-бот · Клинические рекомендации
          </div>
          <h2
            className="lp-section-h2 lp-reveal"
            style={{ maxWidth: 560, margin: "0 auto 18px", textAlign: "center" }}
          >
            Ваша медицинская история<br />
            под <em>контролем ИИ</em>
          </h2>
          <p
            className="lp-reveal"
            style={{ fontSize: 17, color: "var(--lp-text-dim)", maxWidth: 460, margin: "0 auto 52px", lineHeight: 1.72, fontWeight: 300 }}
          >
            Один инстанс — один пациент. Полная изоляция данных.
            Быстрое развёртывание, минимум настройки.
          </p>
          <div className="lp-cta-row lp-reveal">
            <a href="#features" className="lp-btn-primary">
              Возможности →
            </a>
            <a href="#clinrec" className="lp-btn-secondary">
              Клин. рекомендации
            </a>
          </div>

          <div className="lp-contact-block lp-reveal">
            <div className="lp-contact-label">Связаться</div>
            <div className="lp-contact-links">
              <a
                href="https://t.me/victorovi4"
                className="lp-contact-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                @victorovi4
              </a>
              <span className="lp-contact-sep">·</span>
              <a
                href="mailto:dima@cleangames.org"
                className="lp-contact-link"
              >
                dima@cleangames.org
              </a>
            </div>
          </div>
        </div>

        {/* ── FOOTER ───────────────────────────────────────── */}
        <footer className="lp-footer">
          <a href="#top" className="lp-footer-brand">
            <MedCardLogo size={20} />
            МедКарта
          </a>
          <span>Персональная ЭМК с интеллектом ИИ</span>
          <span>2025</span>
        </footer>
      </div>
    </>
  )
}
