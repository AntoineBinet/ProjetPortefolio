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
import { AdminProvider } from './admin/AdminContext';
import { AdminToolbar, AdminLoginModal } from './admin/AdminToolbar';
import { UsersModal } from './admin/UsersModal';
import './styles/base.css';
import './styles/sections.css';
import './styles/admin.css';

const tweaks = { density: 2.2, dark: false, repel: true };

function Site() {
  const [active, setActive] = useState('home');

  useEffect(() => {
    const onScroll = () => {};
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onNav = (id) => {
    setActive(id);
    if (id === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div>
      <Nav active={active} onNav={onNav} dark={false}/>
      <Hero tweaks={tweaks} />
      <Manifeste />
      <Activites />
      <Qualite />
      <Carriere />
      <Agences />
      <Actualites />
      <Footer />
      <AdminToolbar />
      <AdminLoginModal />
      <UsersModal />
    </div>
  );
}

export default function App() {
  return (
    <AdminProvider>
      <Site />
    </AdminProvider>
  );
}
