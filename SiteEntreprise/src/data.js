export const UP_DATA = {
  rotatingWords: ['Expertise', 'Réactivité', 'Proximité', 'Flexibilité'],

  metiers: [
    'Informatique embarquée',
    'Mécatronique',
    'Électronique numérique & analogique',
    'Mécanique et thermique',
    'Optique',
    'Conception logicielle',
    'Validation & vérification',
    'Industrialisation',
  ],
  secteurs: [
    { key: 'transport', label: 'Transport & véhicules autonomes' },
    { key: 'energie', label: 'Énergie & distribution' },
    { key: 'sante', label: 'Santé & dispositifs médicaux' },
    { key: 'aero', label: 'Aéronautique & défense' },
    { key: 'industrie', label: 'Industrie 4.0' },
  ],
  projets: [
    'Études de faisabilité',
    'Conception & développement',
    'Prototypage rapide',
    'Tests & qualification',
    'Mise en série',
  ],

  agences: [
    { ville: 'Lyon', adresse: '12 rue de la Part-Dieu, 69003 Lyon', founded: 2015, lat: 45.760, lng: 4.857 },
    { ville: 'Paris', adresse: '8 boulevard Haussmann, 75009 Paris', founded: 2016, lat: 48.873, lng: 2.331 },
    { ville: 'Grenoble', adresse: '24 avenue Félix Viallet, 38000 Grenoble', founded: 2023, lat: 45.190, lng: 5.722 },
    { ville: 'Aix-en-Provence', adresse: '15 avenue Paul Cézanne, 13100 Aix', founded: 2018, lat: 43.526, lng: 5.445 },
    { ville: 'Toulon', adresse: '5 place de la Liberté, 83000 Toulon', founded: 2020, lat: 43.124, lng: 5.928 },
    { ville: 'Nice Sophia', adresse: '930 route des Dolines, 06560 Valbonne', founded: 2024, lat: 43.617, lng: 7.060 },
  ],

  whyUp: [
    { title: 'Pourquoi créer une société de conseil en industrie ?', icon: 'help', text: "Up Technologies a l'expérience, bonne et mauvaise, des sociétés de conseil. Nous proposons une société à taille humaine, où l'humain reste au centre." },
    { title: 'Changement de génération', icon: 'compass', text: "Les profils qui évoluent en société de conseil sont généralement dans leur premier tiers de parcours. Up Technologies casse les codes." },
    { title: "La réactivité n'est plus une option", icon: 'clock', text: "Un besoin de consultant chez nos clients est toujours urgent. Notre mode de fonctionnement nous permet d'y répondre en moins de 48h." },
    { title: 'Développer le réseau de contacts', icon: 'network', text: "Pour proposer autant de missions que les grandes sociétés de conseil, il faut être intégré à un réseau dense d'industriels." },
    { title: 'Des projets de carrière différents', icon: 'flag', text: "La proximité avec chaque consultant permet d'anticiper et de mettre en place les actions adaptées à chacun." },
  ],

  cards3: [
    { title: 'Nos Métiers', icon: 'cpu', items: ['Informatique embarquée', 'Mécatronique', 'Électronique', 'Mécanique', 'Optique', 'Validation'] },
    { title: 'Nos Secteurs', icon: 'sectors', items: ['Transport autonome', 'Énergie', 'Santé', 'Aéronautique & défense', 'Industrie 4.0'] },
    { title: 'Nos Projets Types', icon: 'project', items: ['Faisabilité', 'Conception', 'Prototypage', 'Tests & qualif.', 'Industrialisation'] },
  ],

  certifications: [
    { kind: 'iso9001', name: 'ISO 9001:2015', desc: 'Management de la qualité', year: '2024' },
    { kind: 'iso14001', name: 'ISO 14001', desc: 'Management environnemental', year: '2024' },
    { kind: 'iso27001', name: 'ISO 27001', desc: "Sécurité de l'information", year: '2024' },
    { kind: 'ecovadis', name: 'EcoVadis Silver', desc: 'Performance RSE', year: '2024' },
    { kind: 'cir', name: 'Agrément CIR', desc: 'Crédit Impôt Recherche', year: '2024' },
    { kind: 'tftp', name: 'Time for the Planet', desc: 'Engagement climatique', year: '2024' },
  ],

  carriere: {
    avantages: [
      { title: 'Missions variées', text: 'Des missions de 6 à 18 mois dans des secteurs variés — un terrain de jeu permanent.' },
      { title: 'Enrichissement personnel', text: 'Diversité des métiers, personnalités et cultures. Apprentissage constant.' },
      { title: 'Réseau professionnel', text: 'Le métier vous expose naturellement à un réseau professionnel dense.' },
      { title: 'Évolution rapide', text: 'Vos progrès sont visibles : montée en compétence concrète, mois après mois.' },
    ],
    questions: [
      'Quels sont vos points forts ?',
      'Vos traits de personnalité sont-ils compatibles avec le métier de consultant ?',
      "Qu'est-ce qui est important pour vous : un secteur, une discipline ?",
      'Quelle est votre mobilité géographique ?',
    ],
  },

  actualites: [
    { date: '17 décembre 2025', tag: 'Certification', title: "Une médaille d'argent EcoVadis", excerpt: "En fin 2025, Up Technologies franchit une nouvelle étape : l'obtention de la médaille d'argent EcoVadis." },
    { date: '29 mars 2025', tag: 'Technique', title: "L'électronique au cœur des équipes", excerpt: "Chez Up Technologies, les équipes internes sont quotidiennement immergées dans des projets électroniques de pointe." },
    { date: '20 février 2025', tag: 'Technique', title: 'Un défi pour Power Up', excerpt: "La testabilité des cartes électroniques est devenue un enjeu majeur — voici comment Power Up y répond." },
    { date: '14 février 2025', tag: 'Certification', title: '2 fois plus certifié', excerpt: 'Up Technologies a franchi une nouvelle étape en obtenant deux certifications complémentaires.' },
    { date: '5 février 2025', tag: 'RSE', title: "Nos objectifs environnementaux 🌱", excerpt: "Up Technologies est engagée dans une démarche environnementale ambitieuse pour 2030." },
    { date: '15 avril 2024', tag: 'Agence', title: 'Nouvelle agence : Nice Sophia', excerpt: "Up Technologies s'agrandit ! Nous sommes désormais présents sur Sophia Antipolis." },
    { date: '8 janvier 2024', tag: 'Événement', title: 'Soirée de Noël 2023', excerpt: "Vendredi dernier, l'ensemble des équipes s'est retrouvé pour une soirée mémorable." },
    { date: '31 octobre 2023', tag: 'Agence', title: "Inauguration de l'agence de Grenoble", excerpt: "Nouveaux locaux pour l'équipe grenobloise — un cadre repensé pour mieux collaborer." },
  ],
};
