import { useEffect, useMemo, useRef, useState } from 'react';
import Lenis from 'lenis';
import { MotionConfig, useReducedMotion } from 'motion/react';
import TechBackdrop from './components/TechBackdrop';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import ScrollNarrative from './components/ScrollNarrative';
import BentoCapabilities from './components/BentoCapabilities';
import ArchitectureStrip from './components/ArchitectureStrip';
import DownloadSection from './components/DownloadSection';
import ChangelogSection from './components/ChangelogSection';
import SponsorsAndFaq from './components/SponsorsAndFaq';
import HorizonFooter from './components/HorizonFooter';
import { detectPlatform } from './utils/format';

const PLATFORM_NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' };

export default function App() {
  const prefersReduced = useReducedMotion() ?? false;
  const [downloads, setDownloads] = useState(null);
  const [dlLoading, setDlLoading] = useState(true);
  const [dlError, setDlError] = useState(false);

  const [changelogMd, setChangelogMd] = useState('');
  const [clLoading, setClLoading] = useState(true);
  const [clError, setClError] = useState(false);

  const [sponsors, setSponsors] = useState(null);
  const [spLoading, setSpLoading] = useState(true);

  const lenisRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  useEffect(() => {
    if (prefersReduced) return;
    const lenis = new Lenis({
      lerp: 0.22,
      wheelMultiplier: 1.35,
      touchMultiplier: 1.4,
      smoothWheel: true
    });
    lenisRef.current = lenis;
    let rafId = 0;
    const raf = (time) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [prefersReduced]);

  const handleAnchorClick = (e, href) => {
    if (!href || !href.startsWith('#')) return;
    const target = href === '#top' ? document.body : document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    if (lenisRef.current) {
      lenisRef.current.scrollTo(target, { offset: href === '#top' ? 0 : -72 });
    } else {
      target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' });
    }
  };

  useEffect(() => {
    fetch('api/downloads', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((d) => {
        if (!d || !Array.isArray(d.items) || d.items.length === 0) throw new Error('empty');
        setDownloads(d);
      })
      .catch(() => setDlError(true))
      .finally(() => setDlLoading(false));

    fetch('api/changelog', { headers: { Accept: 'text/markdown' } })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((md) => setChangelogMd(md))
      .catch(() => setClError(true))
      .finally(() => setClLoading(false));

    fetch('api/sponsors', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((sp) => setSponsors(sp))
      .catch(() => setSponsors({ list: [] }))
      .finally(() => setSpLoading(false));
  }, []);

  const currentPlatform = useMemo(() => detectPlatform(), []);
  const platformLabel = currentPlatform ? PLATFORM_NAMES[currentPlatform] : null;
  const primaryDownload = useMemo(() => {
    const items = downloads?.items || [];
    if (!currentPlatform || !items.length) return null;
    return items.find((i) => i.platform === currentPlatform && i.primary) || items.find((i) => i.platform === currentPlatform) || null;
  }, [downloads, currentPlatform]);

  return (
    <MotionConfig reducedMotion="user">
      <TechBackdrop reducedMotion={prefersReduced} />

      <Navbar
        version={downloads?.version || __SITE_APP_VERSION__}
        primaryDownload={primaryDownload}
        platformLabel={platformLabel}
        onAnchorClick={handleAnchorClick}
      />

      <main id="top" className="relative z-10">
        <HeroSection
          downloads={downloads}
          primaryDownload={primaryDownload}
          platformLabel={platformLabel}
          onAnchorClick={handleAnchorClick}
          reducedMotion={prefersReduced}
        />

        <ScrollNarrative reducedMotion={prefersReduced} />

        <BentoCapabilities reducedMotion={prefersReduced} />

        <ArchitectureStrip reducedMotion={prefersReduced} />

        <DownloadSection
          downloads={downloads}
          loading={dlLoading}
          error={dlError}
          currentPlatform={currentPlatform}
          primaryDownload={primaryDownload}
          platformLabel={platformLabel}
          reducedMotion={prefersReduced}
        />

        <ChangelogSection
          markdown={changelogMd}
          loading={clLoading}
          error={clError}
          reducedMotion={prefersReduced}
        />

        <SponsorsAndFaq
          sponsors={sponsors}
          sponsorsLoading={spLoading}
          downloads={downloads}
          reducedMotion={prefersReduced}
        />

        <HorizonFooter
          downloads={downloads}
          onAnchorClick={handleAnchorClick}
          reducedMotion={prefersReduced}
        />
      </main>
    </MotionConfig>
  );
}
