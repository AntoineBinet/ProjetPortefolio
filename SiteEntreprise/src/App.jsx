import { useState, useEffect } from 'react';
import Nav from './components/Nav';
import Footer from './components/Footer';
import Hero from './pages/Hero';
import Manifeste from './pages/Manifeste';
import Activites from './pages/Activites';
import Qualite from './pages/Qualite';
import Carriere from './pages/Carriere';
import Agences from './pages/Agences';
import Actualites from './pages/Actualites';
import { TweaksPanel, TweakSection, TweakColor, TweakToggle, useTweaks } from './components/TweaksPanel';
import './styles/base.css';
import './styles/sections.css';

const tweakDefaults = {
  density: 1.6,
  dark: false,
  repel: true,
  accent: '#EF8827',
};

export default function App() {
  const [tweaks, setTweak] = useTweaks(tweakDefaults);
  const [active, setActive] = useState('home');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--orange', tweaks.accent);
  }, [tweaks.accent]);

  const onNav = (id) => {
    setActive(id);
    if (id === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className={tweaks.dark ? 'theme-dark' : ''}>
      <Nav active={active} onNav={onNav} dark={tweaks.dark && !scrolled}/>
      <Hero tweaks={tweaks} />
      <Manifeste />
      <Activites />
      <Qualite />
      <Carriere />
      <Agences />
      <Actualites />
      <Footer />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Apparence">
          <TweakColor label="Accent orange" value={tweaks.accent} onChange={v => setTweak('accent', v)} />
          <TweakToggle label="Hero sombre" value={tweaks.dark} onChange={v => setTweak('dark', v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}
